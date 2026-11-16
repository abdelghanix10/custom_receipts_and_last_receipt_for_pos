/** @odoo-module */
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";
import { proxy, Component, xml } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

// Cache compiled dynamic OWL 3 receipt components by XML content
const _compiledReceiptComponentCache = new Map();

/**
 * Normalizes custom receipt XML for Odoo 20 (OWL 3):
 * 1. Replaces deprecated `t-esc=` with `t-out=`
 * 2. Prefixes standalone `props.` and `env.` references with `this.`
 */
function normalizeReceiptXmlForOwl3(rawXml) {
  if (!rawXml) {
    return "";
  }
  return rawXml
    .replace(/\bt-esc=/g, "t-out=")
    .replace(/(?<![.\w])props\./g, "this.props.")
    .replace(/(?<![.\w])env\./g, "this.env.");
}

patch(OrderReceipt.prototype, {
  setup() {
    super.setup(...arguments);
    this.state = proxy({
      template: true,
    });
    this.pos = usePos();
  },

  get templateProps() {
    const prebuiltData = this.props.data || this.props.order?.receiptData;

    if (
      prebuiltData &&
      (prebuiltData.orderlines || prebuiltData.last_receipt)
    ) {
      const headerData = prebuiltData.headerData || {};
      const safeData = {
        ...prebuiltData,
        orderlines: prebuiltData.orderlines || [],
        paymentlines: prebuiltData.paymentlines || [],
        tax_details: prebuiltData.tax_details || [],
        amount_total: prebuiltData.amount_total || 0,
        total_with_tax: prebuiltData.total_with_tax || 0,
        total_without_tax: prebuiltData.total_without_tax || 0,
        change: prebuiltData.change || 0,
        name: prebuiltData.name || "",
        date: prebuiltData.date || "",
        is_duplicate: Boolean(prebuiltData.is_duplicate),
        headerData: {
          header: headerData.header || "",
          cashier: headerData.cashier || "",
          company: headerData.company || {},
          ...headerData,
        },
      };

      return {
        data: safeData,
        order: this.props.order,
        receipt: safeData,
        orderlines: safeData.orderlines,
        paymentlines: safeData.paymentlines,
      };
    }

    const order = this.props.order;
    if (!order) {
      return {
        data: {},
        order: null,
        receipt: { headerData: { header: "", cashier: "", company: {} } },
        orderlines: [],
        paymentlines: [],
      };
    }

    // Extract order lines
    const lines =
      order.lines || order.orderlines || order.get_orderlines?.() || [];
    let linesArray = [];
    if (Array.isArray(lines)) {
      linesArray = lines;
    } else if (typeof lines.getAll === "function") {
      linesArray = lines.getAll();
    } else if (typeof lines[Symbol.iterator] === "function") {
      linesArray = [...lines];
    }

    const orderlines = linesArray.map((line, idx) => {
      let productName = "Product";
      if (line.full_product_name) {
        productName = line.full_product_name;
      } else if (line.get_full_product_name) {
        productName = line.get_full_product_name();
      } else if (line.product) {
        productName =
          line.product.display_name || line.product.name || "Product";
      } else if (line.product_id && typeof line.product_id === "object") {
        productName =
          line.product_id.display_name || line.product_id.name || "Product";
      }

      const qty = line.quantity || line.qty || line.get_quantity?.() || 0;
      const price =
        line.price_subtotal_incl ||
        line.get_display_price?.() ||
        line.price ||
        0;
      const unitPrice = line.price_unit || line.get_unit_display_price?.() || 0;
      const discount = line.discount || line.get_discount?.() || 0;

      return {
        id: line.id || `line_${idx}`,
        productName,
        qty,
        unit_price: this.env.utils?.formatCurrency?.(unitPrice) || unitPrice,
        price: this.env.utils?.formatCurrency?.(price) || price,
        discount,
        customerNote: line.customer_note || line.customerNote || "",
        price_subtotal_incl: price,
        price_subtotal: line.price_subtotal || price,
        price_unit: unitPrice,
      };
    });

    // Extract payment lines
    const payments =
      order.payment_ids ||
      order.paymentlines ||
      order.get_paymentlines?.() ||
      [];
    let paymentsArray = [];
    if (Array.isArray(payments)) {
      paymentsArray = payments;
    } else if (typeof payments.getAll === "function") {
      paymentsArray = payments.getAll();
    } else if (typeof payments[Symbol.iterator] === "function") {
      paymentsArray = [...payments];
    }

    const paymentlines = paymentsArray
      .filter((payment) => {
        const amount = payment.amount || payment.get_amount?.() || 0;
        return amount > 0;
      })
      .map((payment, idx) => {
        let name = "Payment";
        if (
          payment.payment_method_id &&
          typeof payment.payment_method_id === "object"
        ) {
          name = payment.payment_method_id.name || "Payment";
        } else if (payment.name) {
          name = payment.name;
        } else if (payment.payment_method) {
          name = payment.payment_method.name || "Payment";
        }
        return {
          id: payment.id || `payment_${idx}`,
          name,
          amount: payment.amount || payment.get_amount?.() || 0,
        };
      });

    const amount_total =
      order.amount_total || order.get_total_with_tax?.() || 0;
    const amount_tax = order.amount_tax || order.get_total_tax?.() || 0;
    const change = order.amount_return || order.get_change?.() || 0;

    let formattedDate = "";
    const rawDate = order.date_order || order.validation_date;
    if (rawDate) {
      try {
        const dateObj = new Date(rawDate);
        formattedDate = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
      } catch {
        formattedDate = String(rawDate);
      }
    } else {
      const now = new Date();
      formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    }

    const receiptData = {
      name: order.name || order.pos_reference || "",
      date: formattedDate,
      orderlines,
      paymentlines,
      amount_total: Math.round(amount_total * 100) / 100,
      total_with_tax: Math.round(amount_total * 100) / 100,
      total_without_tax: Math.round((amount_total - amount_tax) * 100) / 100,
      change: Math.round(change * 100) / 100,
      tax_details: [],
      total_tax: Math.round(amount_tax * 100) / 100,
      is_duplicate: false,
      headerData: {
        header: this.pos.config?.receipt_header || "",
        cashier: this.pos.cashier?.name || this.pos.user?.name || "",
        company: this.pos.company || {},
      },
    };

    return {
      data: receiptData,
      order,
      receipt: receiptData,
      orderlines,
      paymentlines,
    };
  },

  get templateComponent() {
    let receipt_design = this.pos.config.design_receipt;
    let useCustom = this.pos.config.is_custom_receipt;

    const isLastReceipt =
      this.props.data?.last_receipt ||
      this.props.order?.receiptData?.last_receipt;
    if (isLastReceipt) {
      receipt_design = this.pos.config.last_design_receipt;
      useCustom = this.pos.config.is_print_last_receipt;
    }

    if (!useCustom || !receipt_design) {
      return null;
    }

    const normalizedXml = normalizeReceiptXmlForOwl3(receipt_design);
    if (_compiledReceiptComponentCache.has(normalizedXml)) {
      return _compiledReceiptComponentCache.get(normalizedXml);
    }

    // In OWL 3 (Odoo 20), do NOT define `static props` on components
    class CustomReceiptDesign extends Component {
      static template = xml`${normalizedXml}`;
    }

    _compiledReceiptComponentCache.set(normalizedXml, CustomReceiptDesign);
    return CustomReceiptDesign;
  },

  get isTrue() {
    const isLastReceipt =
      this.props.data?.last_receipt ||
      this.props.order?.receiptData?.last_receipt;

    if (isLastReceipt) {
      return !this.pos.config.is_print_last_receipt;
    }
    return !this.pos.config.is_custom_receipt;
  },
});

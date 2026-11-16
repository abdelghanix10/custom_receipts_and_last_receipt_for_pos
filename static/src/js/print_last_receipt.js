/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

let _cachedLastReceiptPrinterName = null;

export class PrintLastReceiptButton extends Component {
  static template = "custom_receipts_for_pos.PrintLastReceiptButton";

  setup() {
    this.pos = usePos();
    this.printer = useService("printer");
    this.notification = useService("notification");
  }

  async onClick() {
    const orders = this.pos.models["pos.order"].getAll();

    const paidOrders = orders.filter(
      (order) =>
        order.state === "paid" ||
        order.state === "done" ||
        order.state === "invoiced",
    );

    if (paidOrders.length === 0) {
      this.notification.add(_t("No paid orders found to print."), {
        type: "warning",
      });
      return;
    }

    const lastOrder = paidOrders[paidOrders.length - 1];

    try {
      let orderLines = [];
      if (lastOrder.lines) {
        if (Array.isArray(lastOrder.lines)) {
          orderLines = lastOrder.lines;
        } else if (typeof lastOrder.lines.getAll === "function") {
          orderLines = lastOrder.lines.getAll();
        } else if (typeof lastOrder.lines[Symbol.iterator] === "function") {
          orderLines = [...lastOrder.lines];
        }
      } else if (lastOrder.line_ids) {
        if (Array.isArray(lastOrder.line_ids)) {
          orderLines = lastOrder.line_ids;
        } else if (typeof lastOrder.line_ids.getAll === "function") {
          orderLines = lastOrder.line_ids.getAll();
        } else if (typeof lastOrder.line_ids[Symbol.iterator] === "function") {
          orderLines = [...lastOrder.line_ids];
        }
      }

      let paymentLines = [];
      if (lastOrder.payment_ids) {
        if (Array.isArray(lastOrder.payment_ids)) {
          paymentLines = lastOrder.payment_ids;
        } else if (typeof lastOrder.payment_ids.getAll === "function") {
          paymentLines = lastOrder.payment_ids.getAll();
        } else if (
          typeof lastOrder.payment_ids[Symbol.iterator] === "function"
        ) {
          paymentLines = [...lastOrder.payment_ids];
        }
      } else if (lastOrder.payments) {
        if (Array.isArray(lastOrder.payments)) {
          paymentLines = lastOrder.payments;
        } else if (typeof lastOrder.payments.getAll === "function") {
          paymentLines = lastOrder.payments.getAll();
        } else if (typeof lastOrder.payments[Symbol.iterator] === "function") {
          paymentLines = [...lastOrder.payments];
        }
      }

      const orderlinesData = orderLines.map((line, index) => {
        let lineData = line;
        if (typeof line === "number" || typeof line === "string") {
          lineData = this.pos.models["pos.order.line"]?.get(line) || {};
        }

        let productName = "Product";
        if (lineData.full_product_name) {
          productName = lineData.full_product_name;
        } else if (lineData.product_id) {
          if (typeof lineData.product_id === "object") {
            productName =
              lineData.product_id.display_name ||
              lineData.product_id.name ||
              "Product";
          } else if (typeof lineData.product_id === "number") {
            const product = this.pos.models["product.product"]?.get(
              lineData.product_id,
            );
            productName = product?.display_name || product?.name || "Product";
          }
        }

        const unitPrice = lineData.price_unit || 0;
        const subtotalIncl = lineData.price_subtotal_incl || unitPrice;

        return {
          id: lineData.id || `line_${index}`,
          productName,
          qty: lineData.qty || lineData.quantity || 0,
          unit_price: this.env.utils.formatCurrency(unitPrice),
          price: this.env.utils.formatCurrency(subtotalIncl),
          discount: lineData.discount || 0,
          customerNote: lineData.customer_note || lineData.note || "",
          price_subtotal_incl: subtotalIncl,
          price_subtotal: lineData.price_subtotal || 0,
          price_unit: unitPrice,
        };
      });

      const paymentlinesData = paymentLines
        .filter((payment) => {
          let paymentData = payment;
          if (typeof payment === "number" || typeof payment === "string") {
            paymentData = this.pos.models["pos.payment"]?.get(payment) || {};
          }
          return (paymentData.amount || 0) > 0;
        })
        .map((payment, index) => {
          let paymentData = payment;
          if (typeof payment === "number" || typeof payment === "string") {
            paymentData = this.pos.models["pos.payment"]?.get(payment) || {};
          }

          let paymentName = "Payment";
          if (paymentData.payment_method_id) {
            if (typeof paymentData.payment_method_id === "object") {
              paymentName = paymentData.payment_method_id.name || "Payment";
            } else if (typeof paymentData.payment_method_id === "number") {
              const method = this.pos.models["pos.payment.method"]?.get(
                paymentData.payment_method_id,
              );
              paymentName = method?.name || "Payment";
            }
          } else if (paymentData.name) {
            paymentName = paymentData.name;
          }

          return {
            id: paymentData.id || `payment_${index}`,
            name: paymentName,
            amount: paymentData.amount || 0,
          };
        });

      const amount_tax = Math.round((lastOrder.amount_tax || 0) * 100) / 100;

      const companyData = {
        id: this.pos.company.id,
        name: this.pos.company.name || "",
        street: this.pos.company.street || "",
        street2: this.pos.company.street2 || "",
        city: this.pos.company.city || "",
        zip: this.pos.company.zip || "",
        vat: this.pos.company.vat || "",
        phone: this.pos.company.phone || "",
        email: this.pos.company.email || "",
        website: this.pos.company.website || "",
        logo: this.pos.company.logo || null,
      };

      let formattedDate = "";
      const rawDate = lastOrder.date_order;
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
        name: lastOrder.name || lastOrder.pos_reference || "",
        date: formattedDate,
        orderlines: orderlinesData,
        paymentlines: paymentlinesData,
        amount_total: Math.round((lastOrder.amount_total || 0) * 100) / 100,
        total_with_tax: Math.round((lastOrder.amount_total || 0) * 100) / 100,
        total_without_tax:
          Math.round(
            ((lastOrder.amount_total || 0) - (lastOrder.amount_tax || 0)) * 100,
          ) / 100,
        amount_tax,
        change: Math.round((lastOrder.amount_return || 0) * 100) / 100,
        tax_details: [],
        taxDetails: [],
        total_tax: amount_tax,
        company: companyData,
        cashier: this.pos.cashier?.name || this.pos.user?.name || "",
        headerData: {
          company: companyData,
          cashier: this.pos.cashier?.name || this.pos.user?.name || "",
          header: this.pos.config.receipt_header || "",
        },
        last_receipt: true,
        is_duplicate: Boolean(
          this.pos.config.last_receipt_show_duplicate_badge,
        ),
        order: lastOrder,
      };

      const orderWithReceiptData = Object.create(lastOrder);
      Object.assign(orderWithReceiptData, {
        receiptData,
        name: lastOrder.name || receiptData.name,
        date_order: lastOrder.date_order || receiptData.date,
        getReceiptHeaderData: () => receiptData.headerData,
        get_orderlines: () => receiptData.orderlines,
        get_paymentlines: () => receiptData.paymentlines,
        get_total_with_tax: () => receiptData.amount_total,
        get_total_without_tax: () => receiptData.total_without_tax,
        get_total_tax: () => receiptData.amount_tax,
        get_tax_details: () => receiptData.tax_details,
        get_change: () => receiptData.change,
        tax_details: receiptData.tax_details,
        taxDetails: receiptData.tax_details,
      });

      const printMethod = this.pos.config.last_receipt_print_method || "chrome";

      if (printMethod === "qz_tray") {
        const qzService = this.env.services.qz_tray;
        if (!qzService) {
          this.notification.add(
            _t(
              "QZ Tray service not available. Please ensure odoo_qz_print is installed.",
            ),
            { type: "danger" },
          );
          return;
        }

        await qzService.connect();
        const qzLib = qzService.getQZ();
        if (!qzLib) {
          throw new Error("QZ Tray library not loaded");
        }

        const renderer = this.env.services.renderer;
        const receiptHtml = await renderer.toHtml(
          OrderReceipt,
          {
            order: orderWithReceiptData,
            data: receiptData,
          },
          { addClass: "pos-receipt-print" },
        );

        const htmlContent = `<html>
                    <head>
                        <style>
                            body { font-family: "Courier New", Courier, monospace; font-weight: bold; }
                            table { table-layout: fixed; width: 100%; }
                            .pos-receipt-print { font-size: 14px; }
                        </style>
                    </head>
                    <body>${receiptHtml.outerHTML}</body>
                </html>`;

        if (!_cachedLastReceiptPrinterName) {
          _cachedLastReceiptPrinterName = await qzLib.printers.getDefault();
        }

        await qzService.print(
          _cachedLastReceiptPrinterName,
          htmlContent,
          "pixel",
          {},
          true,
        );

        this.notification.add(
          _t("Last receipt printed via QZ Tray for order: ") +
            (lastOrder.name || lastOrder.pos_reference),
          { type: "success" },
        );
      } else {
        const isPrinted = await this.printer.print(
          OrderReceipt,
          { order: orderWithReceiptData },
          { webPrintFallback: true },
        );

        if (isPrinted) {
          this.notification.add(
            _t("Last receipt printed for order: ") +
              (lastOrder.name || lastOrder.pos_reference),
            { type: "success" },
          );
        }
      }
    } catch (error) {
      this.notification.add(_t("Error printing receipt: ") + error.message, {
        type: "danger",
      });
    }
  }
}

patch(ActionpadWidget, {
  components: { ...ActionpadWidget.components, PrintLastReceiptButton },
});

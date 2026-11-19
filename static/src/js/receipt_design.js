/** @odoo-module */

import { Component, useProps, xml } from "@odoo/owl";
import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { waitImages } from "@point_of_sale/utils";
import { formatCurrency } from "@web/core/currency";
import { patch } from "@web/core/utils/patch";
import { renderToElement } from "@web/core/utils/render";
import { getQzService } from "@odoo_qz_print/qz_service";

const compiledReceiptComponentCache = new Map();

function normalizeReceiptXmlForOwl3(rawXml) {
  if (!rawXml) {
    return "";
  }
  return rawXml
    .replace(/\bt-esc=/g, "t-out=")
    .replace(/(?<![.\w])(?:this\.)?props\./g, "this.props.")
    .replace(/(?<![.\w])(?:this\.)?env\./g, "this.receiptEnv.");
}

function getCompiledReceiptComponent(rawXml) {
  const normalizedXml = normalizeReceiptXmlForOwl3(rawXml);
  if (!normalizedXml) {
    return null;
  }
  if (compiledReceiptComponentCache.has(normalizedXml)) {
    return compiledReceiptComponentCache.get(normalizedXml);
  }

  class CustomReceiptDesign extends Component {
    static template = xml`${normalizedXml}`;
    props = useProps();

    get receiptEnv() {
      return this.props._receiptEnv;
    }
  }

  compiledReceiptComponentCache.set(normalizedXml, CustomReceiptDesign);
  return CustomReceiptDesign;
}

function toArray(collection) {
  if (!collection) {
    return [];
  }
  if (Array.isArray(collection)) {
    return collection;
  }
  if (typeof collection.getAll === "function") {
    return collection.getAll();
  }
  if (typeof collection[Symbol.iterator] === "function") {
    return [...collection];
  }
  return [];
}

function wrapCustomReceiptHtml(innerHtml, { isDuplicate = false } = {}) {
  const duplicateBanner = isDuplicate
    ? `<div style="text-align:center; font-weight:bold; font-size:15px; border:2px solid #000; padding:4px; margin-bottom:8px;">*** DUPLICATE RECEIPT ***</div>`
    : "";

  return `<html id="pos-receipt">
    <head>
      <meta charset="utf-8"/>
      <style>
        body { font-family: "Courier New", Courier, monospace; font-weight: bold; margin: 0; padding: 8px; }
        table { table-layout: fixed; width: 100%; }
        .pos-receipt-print { font-size: 14px; }
        .pos-receipt-right-align { float: right; }
        .pos-receipt-logo { max-width: 150px; display: block; margin: 0 auto; }
      </style>
    </head>
    <body><div class="pos-receipt-print">${duplicateBanner}${innerHtml}</div></body>
  </html>`;
}

patch(PosTicketPrinterPlugin.prototype, {
  _buildCustomReceiptEnv() {
    const config = this.config;
    const company = config?.company_id || {};
    const currencyId = config?.currency_id?.id;
    const companyProxy = Object.assign(Object.create(company), {
      vat_label: company?.vat_label || company?.country_id?.vat_label || "Tax ID",
    });
    const fmtCurrency = (amount) => {
      try {
        return currencyId ? formatCurrency(amount || 0, currencyId) : String(amount || 0);
      } catch {
        return String(amount || 0);
      }
    };

    return {
      services: {
        ...(this.env?.services || {}),
        pos: { config, company: companyProxy, models: this.data.models },
      },
      utils: { ...(this.env?.utils || {}), formatCurrency: fmtCurrency },
    };
  },

  _buildCustomReceiptTemplateProps(order, { isLastReceipt = false } = {}) {
    const receiptEnv = this._buildCustomReceiptEnv();
    const fmtCurrency = receiptEnv.utils.formatCurrency;
    const config = this.config;
    const company = receiptEnv.services.pos.company;
    const linesArray = toArray(
      order?.lines || order?.line_ids || order?.orderlines || order?.get_orderlines?.(),
    );
    const orderlines = linesArray.map((rawLine, idx) => {
      let line = rawLine;
      if (typeof rawLine === "number" || typeof rawLine === "string") {
        line = this.data.models["pos.order.line"]?.get(rawLine) || {};
      }
      let productName = "Product";
      if (typeof line.getFullProductName === "function") {
        productName = line.getFullProductName();
      } else if (line.full_product_name) {
        productName = line.full_product_name;
      } else if (line.product_id) {
        if (typeof line.product_id === "object") {
          productName = line.product_id.display_name || line.product_id.name || "Product";
        } else if (typeof line.product_id === "number") {
          const product = this.data.models["product.product"]?.get(line.product_id);
          productName = product?.display_name || product?.name || "Product";
        }
      }
      const qty = line.qty ?? line.quantity ?? 0;
      const unitPrice = line.price_unit ?? 0;
      const subtotalIncl = line.price_subtotal_incl ?? unitPrice * qty;
      return {
        id: line.id || `line_${idx}`,
        productName,
        qty,
        unit_price: fmtCurrency(unitPrice),
        price: fmtCurrency(subtotalIncl),
        discount: line.discount || 0,
        customerNote: line.customer_note || line.customerNote || "",
        price_subtotal_incl: subtotalIncl,
        price_subtotal: line.price_subtotal ?? subtotalIncl,
        price_unit: unitPrice,
      };
    });

    const paymentsArray = toArray(
      order?.payment_ids || order?.payments || order?.paymentlines || order?.get_paymentlines?.(),
    );
    const paymentlines = paymentsArray
      .map((rawPayment) => {
        if (typeof rawPayment === "number" || typeof rawPayment === "string") {
          return this.data.models["pos.payment"]?.get(rawPayment) || {};
        }
        return rawPayment;
      })
      .filter((payment) => (payment.amount || 0) > 0)
      .map((payment, idx) => {
        let name = "Payment";
        if (payment.payment_method_id) {
          if (typeof payment.payment_method_id === "object") {
            name = payment.payment_method_id.name || "Payment";
          } else if (typeof payment.payment_method_id === "number") {
            const method = this.data.models["pos.payment.method"]?.get(payment.payment_method_id);
            name = method?.name || "Payment";
          }
        } else if (payment.name) {
          name = payment.name;
        }
        return { id: payment.id || `payment_${idx}`, name, amount: payment.amount || 0, ticket: payment.ticket || "" };
      });

    let taxDetails = [];
    try {
      const priceData = order?._constructPriceData?.();
      const taxGroups = priceData?.taxDetails?.subtotals?.[0]?.tax_groups || [];
      taxDetails = taxGroups.map((group, idx) => ({
        id: idx,
        tax: { name: group.group_name },
        amount: group.tax_amount,
      }));
    } catch {
      taxDetails = [];
    }

    const amountTotal = Math.round((order?.amount_total || 0) * 100) / 100;
    const amountTax = Math.round((order?.amount_tax || 0) * 100) / 100;
    const change = Math.round((order?.amount_return || 0) * 100) / 100;
    const totalDiscount =
      typeof order?.getTotalDiscount === "function" ? order.getTotalDiscount() : 0;
    let formattedDate = "";
    if (typeof order?.formatDateOrTime === "function" && order?.date_order) {
      formattedDate = order.formatDateOrTime("date_order", "datetime");
    } else if (order?.date_order) {
      formattedDate = String(order.date_order);
    } else {
      formattedDate = new Date().toLocaleString();
    }
    const cashierName =
      order?.getCashierName?.() || order?.employee_id?.name || order?.user_id?.name || "";
    const isDuplicate = isLastReceipt && Boolean(config?.last_receipt_show_duplicate_badge);
    const receiptData = {
      name: order?.name || order?.pos_reference || "",
      date: formattedDate,
      orderlines,
      paymentlines,
      amount_total: amountTotal,
      total_with_tax: amountTotal,
      total_without_tax: Math.round((amountTotal - amountTax) * 100) / 100,
      amount_tax: amountTax,
      total_tax: amountTax,
      change,
      total_discount: totalDiscount ? fmtCurrency(totalDiscount) : 0,
      tax_details: taxDetails,
      footer: config?.receipt_footer || "",
      footer_html: false,
      last_receipt: isLastReceipt,
      is_duplicate: isDuplicate,
      headerData: { header: config?.receipt_header || "", cashier: cashierName, company },
    };
    return {
      _receiptEnv: receiptEnv,
      data: receiptData,
      order,
      receipt: receiptData,
      orderlines,
      paymentlines,
    };
  },

  async _generateCustomIframe(htmlString) {
    const container = document.getElementById("receipt-iframe-container");
    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.srcdoc = htmlString;
    container.innerHTML = "";
    container.appendChild(iframe);
    await new Promise((resolve) => (iframe.onload = resolve));
    await waitImages(iframe.contentDocument.body);
    return iframe;
  },

  async _renderCustomReceiptHtml(order, { rawXml, isLastReceipt = false } = {}) {
    const ReceiptComponent = getCompiledReceiptComponent(rawXml);
    if (!ReceiptComponent) {
      return null;
    }
    const props = this._buildCustomReceiptTemplateProps(order, { isLastReceipt });
    const innerHtml = await this.getHtmlFromComponent(ReceiptComponent, props);
    return wrapCustomReceiptHtml(innerHtml, { isDuplicate: props.receipt.is_duplicate });
  },

  async printOrderReceipt({
    order,
    basic = false,
    printBillActionTriggered = false,
    webFallback = true,
    simplified = false,
  } = {}) {
    const useCustom = Boolean(this.config?.is_custom_receipt && this.config?.design_receipt);
    if (useCustom) {
      const htmlContent = await this._renderCustomReceiptHtml(order, {
        rawXml: this.config.design_receipt,
        isLastReceipt: false,
      });
      const qzService = getQzService() || this.env?.services?.qz_tray;
      const printMethod = this.config?.receipt_print_method || "chrome";
      let result = { successful: true };
      if (qzService && printMethod === "qz_tray") {
        const printerName = await qzService.getDefaultPrinter();
        await qzService.print(printerName, htmlContent, "pixel", {});
      } else {
        const iframe = await this._generateCustomIframe(htmlContent);
        result = (await this.printWithFallback({ iframe, webFallback })) || { successful: true };
      }
      if (!printBillActionTriggered && result) {
        await this.markReceiptAsPrinted(order);
      } else if (!order.nb_print) {
        order.nb_print = 0;
      }
      if (typeof this.printSecondReceiptForOrder === "function") {
        await this.printSecondReceiptForOrder(order);
      }
      return result;
    }
    return super.printOrderReceipt({
      order,
      basic,
      printBillActionTriggered,
      webFallback,
      simplified,
    });
  },

  async printLastOrderReceipt(order) {
    const useCustom = Boolean(
      this.config?.is_print_last_receipt && this.config?.last_design_receipt,
    );
    const printMethod = this.config?.last_receipt_print_method || "chrome";
    const showDuplicate = Boolean(this.config?.last_receipt_show_duplicate_badge);
    let htmlContent;
    if (useCustom) {
      htmlContent = await this._renderCustomReceiptHtml(order, {
        rawXml: this.config.last_design_receipt,
        isLastReceipt: true,
      });
    } else {
      const data = this.getOrderReceiptData(order);
      const el = renderToElement("point_of_sale.pos_order_receipt", data);
      if (showDuplicate) {
        const body = el.querySelector("body") || el;
        const banner = document.createElement("div");
        banner.style.cssText =
          "text-align:center; font-weight:bold; font-size:15px; border:2px solid #000; padding:4px; margin-bottom:8px;";
        banner.textContent = "*** DUPLICATE RECEIPT ***";
        body.prepend(banner);
      }
      htmlContent = el.outerHTML;
    }
    if (printMethod === "qz_tray") {
      const qzService = getQzService() || this.env?.services?.qz_tray;
      if (!qzService) {
        throw new Error("QZ Tray service not available. Please ensure odoo_qz_print is installed.");
      }
      const printerName = await qzService.getDefaultPrinter();
      await qzService.print(printerName, htmlContent, "pixel", {});
      return { successful: true, method: "qz_tray" };
    }
    const iframe = await this._generateCustomIframe(htmlContent);
    await this.printWithFallback({ iframe, webFallback: true });
    return { successful: true, method: "chrome" };
  },
});

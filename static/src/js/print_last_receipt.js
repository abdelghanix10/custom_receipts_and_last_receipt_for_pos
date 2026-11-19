/** @odoo-module */

import { Component, usePlugin } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { _t } from "@web/core/l10n/translation";
import { NotificationPlugin } from "@web/core/notifications/notification_plugin";
import { patch } from "@web/core/utils/patch";

export class PrintLastReceiptButton extends Component {
  static template = "custom_receipts_for_pos.PrintLastReceiptButton";

  setup() {
    this.pos = usePos();
    this.ticketPrinter = usePlugin(PosTicketPrinterPlugin);
    this.notification = usePlugin(NotificationPlugin);
  }

  async onClick() {
    const orders = this.pos.models["pos.order"].getAll();
    const paidOrders = orders.filter((order) =>
      ["paid", "done", "invoiced"].includes(order.state),
    );

    if (paidOrders.length === 0) {
      this.notification.add(_t("No paid orders found to print."), {
        type: "warning",
      });
      return;
    }

    const lastOrder = paidOrders[paidOrders.length - 1];

    try {
      const result = await this.ticketPrinter.printLastOrderReceipt(lastOrder);
      const orderRef = lastOrder.name || lastOrder.pos_reference || "";

      if (result?.method === "qz_tray") {
        this.notification.add(
          _t("Last receipt printed via QZ Tray for order: ") + orderRef,
          { type: "success" },
        );
      } else {
        this.notification.add(
          _t("Last receipt printed for order: ") + orderRef,
          { type: "success" },
        );
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

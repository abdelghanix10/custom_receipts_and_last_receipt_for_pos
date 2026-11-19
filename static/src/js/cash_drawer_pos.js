/** @odoo-module */

import { PosTicketPrinterPlugin } from "@point_of_sale/app/plugins/pos_ticket_printer_plugin";
import { patch } from "@web/core/utils/patch";
import { getQzService } from "@odoo_qz_print/qz_service";

const CASH_DRAWER_COMMANDS = [
  "\x1B\x70\x00\x19\xFA",
  "\x1B\x70\x00\x32\x32",
  "\x1B\x70\x00\x19\x19",
];

async function openCashDrawer(qzService) {
  if (!qzService) {
    console.warn("[CashDrawer] QZ Tray service not available");
    return false;
  }
  try {
    const printerName = await qzService.getDefaultPrinter();
    for (const cmd of CASH_DRAWER_COMMANDS) {
      try {
        await qzService.print(printerName, cmd, "raw");
        return true;
      } catch (err) {
        console.warn("[CashDrawer] Command failed, trying next:", err.message);
      }
    }
    console.error("[CashDrawer] All commands failed");
  } catch (err) {
    console.error("[CashDrawer] Cash drawer open failed:", err.message);
  }
  return false;
}

patch(PosTicketPrinterPlugin.prototype, {
  async printOrderReceipt(options = {}) {
    if (this.config?.open_cash_drawer_only) {
      const qzService = getQzService() || this.env?.services?.qz_tray;
      await openCashDrawer(qzService);
      return { successful: true };
    }
    return super.printOrderReceipt(options);
  },
});

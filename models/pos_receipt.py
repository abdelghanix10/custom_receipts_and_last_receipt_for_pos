import xml.etree.ElementTree as ET
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class PosReceipt(models.Model):
    _name = 'pos.receipt'
    _description = 'POS Receipts'
    _inherit = ['pos.load.mixin']

    name = fields.Char(string='Name', required=True, help='Name of the POS receipt design')
    design_receipt = fields.Text(
        string='Receipt XML',
        help='Customize your QWeb XML receipt template for POS',
    )
    open_cash_drawer_only = fields.Boolean(
        string='Open Cash Drawer Only',
        help='When enabled, validating an order will open the cash drawer '
             'instead of printing a receipt. Requires QZ Tray integration.',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'design_receipt', 'open_cash_drawer_only']

    def action_validate_xml(self):
        """Validates that the Receipt XML is well-formed XML."""
        self.ensure_one()
        if not self.design_receipt:
            raise ValidationError(_("Receipt XML is empty."))
        try:
            ET.fromstring(f"<templates>{self.design_receipt}</templates>")
        except ET.ParseError as err:
            raise ValidationError(_("Invalid XML syntax in Receipt Design:\n%s", err)) from err

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Valid XML'),
                'message': _('The receipt XML template syntax is valid and ready for Odoo 20 POS.'),
                'type': 'success',
                'sticky': False,
            },
        }
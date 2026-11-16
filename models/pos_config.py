from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    receipt_design_id = fields.Many2one(
        'pos.receipt',
        string='Receipt Design',
        help='Choose any receipt design',
    )
    design_receipt = fields.Text(
        related='receipt_design_id.design_receipt',
        string='Receipt XML',
    )
    logo = fields.Binary(
        related='company_id.logo',
        string='Logo',
        readonly=False,
    )
    is_custom_receipt = fields.Boolean(
        string='Is Custom Receipt',
        help='Indicates whether a custom receipt design is active',
    )
    enable_print_last_receipt = fields.Boolean(
        string='Enable Print Last Receipt',
        help='Show a button in POS to reprint the last paid order receipt',
    )
    is_print_last_receipt = fields.Boolean(
        string='Use Custom Design for Last Receipt',
        help='Use a custom receipt design when printing the last receipt',
    )
    last_receipt_design_id = fields.Many2one(
        'pos.receipt',
        string='Last Receipt Design',
        help='Choose a receipt design for the Print Last Receipt button',
    )
    last_design_receipt = fields.Text(
        related='last_receipt_design_id.design_receipt',
        string='Last Receipt XML',
    )
    last_receipt_show_duplicate_badge = fields.Boolean(
        string='Show Duplicate Banner on Reprint',
        default=True,
        help='Display a "DUPLICATE RECEIPT" banner when reprinting the last receipt',
    )
    receipt_print_method = fields.Selection(
        [('chrome', 'Chrome Preview'), ('qz_tray', 'QZ Tray')],
        string='Print Receipt Method',
        default='chrome',
        help='Chrome Preview uses browser print dialog; QZ Tray prints directly to thermal printer',
    )
    last_receipt_print_method = fields.Selection(
        [('chrome', 'Chrome Preview'), ('qz_tray', 'QZ Tray')],
        string='Print Last Receipt Method',
        default='chrome',
        help='Chrome Preview uses browser print dialog; QZ Tray prints directly to thermal printer',
    )
    open_cash_drawer_only = fields.Boolean(
        related='receipt_design_id.open_cash_drawer_only',
        string='Open Cash Drawer Only',
        help='When enabled, validating an order will open the cash drawer instead of printing a receipt.',
    )
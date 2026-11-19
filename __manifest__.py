{
    'name': 'Custom POS Receipt Design & Last Receipt',
    'version': '20.0.2.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Customize POS receipt designs and print last receipt with one click',
    'description': """
Custom POS Receipt Design & Last Receipt (Odoo 20)
==================================================
Enhance your Point of Sale experience with custom receipt designs and convenient last receipt printing functionality.
- Multiple Receipt Designs with backend XML syntax validation
- Automatic OWL 3 (t-out / this.props) compatibility for custom XML templates
- One-click Print Last Receipt with optional DUPLICATE watermark banner
- Supports both Chrome Print Preview and QZ Tray direct thermal printing
- Open Cash Drawer Only mode via QZ Tray ESC/POS pulse commands
    """,
    'author': 'Abdelghani X',
    'images': ['static/description/banner.png'],
    'depends': ['point_of_sale', 'odoo_qz_print', 'pos_print_second_receipt'],
    'data': [
        'security/ir.access.csv',
        'data/pos_receipt_design1_data.xml',
        'data/pos_receipt_design2_data.xml',
        'data/pos_receipt_design3_data.xml',
        'views/pos_receipt_views.xml',
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'custom_receipts_and_last_receipt_for_pos/static/src/js/receipt_design.js',
            'custom_receipts_and_last_receipt_for_pos/static/src/js/print_last_receipt.js',
            'custom_receipts_and_last_receipt_for_pos/static/src/js/cash_drawer_pos.js',
            'custom_receipts_and_last_receipt_for_pos/static/src/xml/print_last_receipt_button.xml',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'OPL-1',
}
DIGITAL SPHERE SOLUTIONS — VERSION 2
======================================

This version moves the system from browser-only localStorage to a real
Node.js + Express + SQLite application.

FEATURES
- Secure session login
- Role field for Admin / Manager / Salesperson / Technician / Accountant
- Persistent SQLite database
- Dashboard
- POS / Sales
- Products & Inventory
- Services
- Customers
- Quotations
- Invoices
- Projects
- Support / Repairs
- Expenses
- Reports
- JSON backup/export
- Stock deduction when a product is sold
- Mixed product/service sale API foundation
- Existing Digital Sphere Solutions branding/logo

REQUIREMENTS
- Node.js 18+ recommended
- npm

RUN LOCALLY
1. Extract the ZIP.
2. Open a terminal in the extracted folder.
3. Run: npm install
4. Run: npm start
5. Open: http://localhost:3000

DEFAULT LOGIN
Email: admin@digitalsphere.local
Password: ChangeMe123!

IMPORTANT:
Change the default password and SESSION_SECRET before exposing the system
to the public internet.

DATABASE
The SQLite database file `dss.sqlite` is created automatically when the
server first starts. Keep backups using the Reports > Export Backup link.

NEXT PRODUCTION STAGE
- Change-password screen
- Full user/staff management
- Fine-grained permissions
- Invoice/quotation PDF printing
- Receipt printing
- Payment records and payment methods
- Suppliers and purchase orders
- Stock movement ledger
- Serial-number tracking
- Cloud deployment
- HTTPS
- Automated database backups
- WhatsApp/email notifications
- Audit log
- Multi-branch support

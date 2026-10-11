const express=require("express");
const path=require("path");
const Database=require("better-sqlite3");
const bcrypt=require("bcryptjs");
const session=require("express-session");

const app=express();
const PORT=process.env.PORT||3000;
const db=new Database("dss.sqlite");
db.pragma("journal_mode=WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'Salesperson',created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,type TEXT,
 address TEXT,balance REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,brand TEXT,model TEXT,sku TEXT UNIQUE,
 serial_number TEXT,purchase_price REAL DEFAULT 0,selling_price REAL DEFAULT 0,
 stock INTEGER DEFAULT 0,warranty_months INTEGER DEFAULT 0,category TEXT,supplier TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT,price REAL DEFAULT 0,
 description TEXT,status TEXT DEFAULT 'Active'
);
CREATE TABLE IF NOT EXISTS sales(
 id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER,total REAL NOT NULL,payment_method TEXT,
 status TEXT DEFAULT 'Paid',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
);
CREATE TABLE IF NOT EXISTS sale_items(
 id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER,product_id INTEGER,service_id INTEGER,
 description TEXT NOT NULL,quantity INTEGER DEFAULT 1,unit_price REAL NOT NULL,
 FOREIGN KEY(sale_id) REFERENCES sales(id)
);
CREATE TABLE IF NOT EXISTS invoices(
 id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE,customer_id INTEGER,total REAL NOT NULL,
 paid REAL DEFAULT 0,due_date TEXT,status TEXT DEFAULT 'Outstanding',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quotations(
 id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE,customer_id INTEGER,total REAL NOT NULL,
 status TEXT DEFAULT 'Draft',created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects(
 id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,customer_id INTEGER,value REAL DEFAULT 0,
 assigned_to TEXT,start_date TEXT,status TEXT DEFAULT 'Planned',notes TEXT
);
CREATE TABLE IF NOT EXISTS tickets(
 id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE,customer_id INTEGER,device TEXT,
 serial_number TEXT,issue TEXT NOT NULL,technician TEXT,status TEXT DEFAULT 'Open',
 cost REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS expenses(
 id INTEGER PRIMARY KEY AUTOINCREMENT,description TEXT NOT NULL,category TEXT,
 amount REAL NOT NULL,date TEXT
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
`);

const seedUser=db.prepare("SELECT id FROM users LIMIT 1").get();
if(!seedUser){
  const hash=bcrypt.hashSync("ChangeMe123!",12);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run("System Administrator","admin@digitalsphere.local",hash,"Admin");
}
const settings={
 business_name:"Digital Sphere Solutions",
 email:"digitalsphere1234@gmail.com",
 phone:"+233 50 815 6797",
 location:"SuperMarket Junction, Ayeduase, Kumasi"
};
for(const [k,v] of Object.entries(settings))
 db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret:process.env.SESSION_SECRET||"CHANGE_THIS_SESSION_SECRET",
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){if(!req.session.user)return res.status(401).json({error:"Authentication required"});next()}
function role(...roles){return (req,res,next)=>{if(!req.session.user||!roles.includes(req.session.user.role))return res.status(403).json({error:"Permission denied"});next()}}
function rows(sql,params=[]){return db.prepare(sql).all(...params)}
function one(sql,params=[]){return db.prepare(sql).get(...params)}

app.post("/api/login",(req,res)=>{
 const {email,password}=req.body;
 const u=one("SELECT * FROM users WHERE lower(email)=lower(?)",[email||""]);
 if(!u||!bcrypt.compareSync(password||"",u.password_hash))return res.status(401).json({error:"Invalid email or password"});
 req.session.user={id:u.id,name:u.name,email:u.email,role:u.role};
 res.json({user:req.session.user});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));

app.get("/api/dashboard",auth,(req,res)=>{
 const sales=one("SELECT COALESCE(SUM(total),0) total FROM sales").total;
 const expenses=one("SELECT COALESCE(SUM(amount),0) total FROM expenses").total;
 const outstanding=one("SELECT COALESCE(SUM(total-paid),0) total FROM invoices").total;
 const activeProjects=one("SELECT COUNT(*) n FROM projects WHERE status='In Progress'").n;
 const lowStock=one("SELECT COUNT(*) n FROM products WHERE stock<=2").n;
 const customers=one("SELECT COUNT(*) n FROM customers").n;
 res.json({sales,expenses,outstanding,activeProjects,lowStock,customers,
   recentSales:rows(`SELECT s.id,s.total,s.created_at,c.name customer,s.payment_method FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC LIMIT 8`)});
});

const resources={
 customers:["customers",["name","phone","email","type","address","balance"]],
 products:["products",["name","brand","model","sku","serial_number","purchase_price","selling_price","stock","warranty_months","category","supplier"]],
 services:["services",["name","category","price","description","status"]],
 projects:["projects",["name","customer_id","value","assigned_to","start_date","status","notes"]],
 tickets:["tickets",["number","customer_id","device","serial_number","issue","technician","status","cost","created_at"]],
 expenses:["expenses",["description","category","amount","date"]],
};
for(const [key,[table,cols]] of Object.entries(resources)){
 app.get(`/api/${key}`,auth,(req,res)=>res.json(rows(`SELECT * FROM ${table} ORDER BY id DESC`)));
 app.post(`/api/${key}`,auth,(req,res)=>{
   const data=req.body||{};
   const vals=cols.map(c=>data[c]??(c==="status"?"Active":null));
   const placeholders=cols.map(()=>"?").join(",");
   try{
     const info=db.prepare(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${placeholders})`).run(...vals);
     res.status(201).json(one(`SELECT * FROM ${table} WHERE id=?`,[info.lastInsertRowid]));
   }catch(e){res.status(400).json({error:e.message})}
 });
 app.delete(`/api/${key}/:id`,auth,role("Admin","Manager"),(req,res)=>{
   db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);res.json({ok:true});
 });
}

app.get("/api/invoices",auth,(req,res)=>res.json(rows(`SELECT i.*,c.name customer FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id ORDER BY i.id DESC`)));
app.post("/api/invoices",auth,(req,res)=>{
 const {customer_id,total,paid=0,due_date}=req.body;
 const number="INV-"+String((one("SELECT COALESCE(MAX(id),0)+1 n FROM invoices").n)).padStart(4,"0");
 const balance=Number(total)-Number(paid);
 const status=balance<=0?"Paid":"Outstanding";
 const info=db.prepare("INSERT INTO invoices(number,customer_id,total,paid,due_date,status) VALUES(?,?,?,?,?,?)")
   .run(number,customer_id,total,paid,due_date||null,status);
 res.status(201).json(one("SELECT * FROM invoices WHERE id=?",[info.lastInsertRowid]));
});

app.get("/api/quotations",auth,(req,res)=>res.json(rows(`SELECT q.*,c.name customer FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id ORDER BY q.id DESC`)));
app.post("/api/quotations",auth,(req,res)=>{
 const {customer_id,total,status="Draft"}=req.body;
 const number="Q-"+String(one("SELECT COALESCE(MAX(id),0)+1 n FROM quotations").n).padStart(4,"0");
 const info=db.prepare("INSERT INTO quotations(number,customer_id,total,status) VALUES(?,?,?,?)").run(number,customer_id,total,status);
 res.status(201).json(one("SELECT * FROM quotations WHERE id=?",[info.lastInsertRowid]));
});

app.get("/api/sales",auth,(req,res)=>res.json(rows(`SELECT s.*,c.name customer FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC`)));
app.post("/api/sales",auth,(req,res)=>{
 const {customer_id,items,payment_method="Cash"}=req.body;
 if(!Array.isArray(items)||!items.length)return res.status(400).json({error:"Sale requires at least one item"});
 let total=0;
 for(const i of items) total+=Number(i.quantity||1)*Number(i.unit_price||0);
 const tx=db.transaction(()=>{
   const sale=db.prepare("INSERT INTO sales(customer_id,total,payment_method) VALUES(?,?,?)").run(customer_id||null,total,payment_method);
   const item=db.prepare("INSERT INTO sale_items(sale_id,product_id,service_id,description,quantity,unit_price) VALUES(?,?,?,?,?,?)");
   const stock=db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
   for(const i of items){
     const q=Number(i.quantity||1), price=Number(i.unit_price||0);
     if(i.product_id){const p=one("SELECT * FROM products WHERE id=?",[i.product_id]);if(!p||p.stock<q)throw new Error(`Insufficient stock for ${i.description}`);stock.run(q,i.product_id,q)}
     item.run(sale.lastInsertRowid,i.product_id||null,i.service_id||null,i.description,q,price);
   }
   return sale.lastInsertRowid;
 });
 try{const id=tx();res.status(201).json(one("SELECT * FROM sales WHERE id=?",[id]))}
 catch(e){res.status(400).json({error:e.message})}
});

app.get("/api/export",auth,(req,res)=>{
 const dump={};
 for(const table of ["users","customers","products","services","sales","sale_items","invoices","quotations","projects","tickets","expenses","settings"])
   dump[table]=rows(`SELECT * FROM ${table}`);
 res.setHeader("Content-Disposition","attachment; filename=dss-backup.json");
 res.json(dump);
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Digital Sphere Solutions running on http://localhost:${PORT}`));

import { query, transaction } from '../config/database.js';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
  console.log('🌱 Seeding database...');

  await transaction(async (client) => {
    // ==========================================
    // NUMBER RANGES (required for doc numbering)
    // ==========================================
    const numberRanges = [
      ['JE','JE-',10000],['API','API-',10000],['ARI','ARI-',10000],['PAY','PAY-',10000],
      ['PR','PR-',10000],['RFQ','RFQ-',10000],['PO','PO-',10000],['GR','GR-',10000],
      ['QT','QT-',10000],['SQ','SQ-',10000],['SO','SO-',10000],['DL','DL-',10000],
      ['BL','BL-',10000],['AST','AST-',10000],['PRD','PRD-',10000],['MO','MO-',10000],
      ['QI','QI-',10000],['PRJ','PRJ-',10000],['BP','BP-',100000],['MAT','MAT-',100000],
      ['EMP','EMP-',10000],['SM','SM-',10000],['SHP','SHP-',10000],['CN','CN-',10000],
      ['RET','RET-',10000],
      ['PC','PC-',10000],
    ];
    for (const [obj, prefix, start] of numberRanges) {
      await client.query(`INSERT INTO sys_number_ranges (object_type, prefix, current_number) VALUES ($1,$2,$3) ON CONFLICT (object_type) DO NOTHING`, [obj, prefix, start]);
    }

    // ==========================================
    // ROLES (required for user management)
    // ==========================================
    const roles = [
      ['ADMIN', 'System Administrator', true, { all: true, modules: [] }],
      ['FIN_MGR', 'Finance Manager', true, { all: false, modules: ['dashboard','finance','master-data','settings'] }],
      ['SALES_MGR', 'Sales Manager', true, { all: false, modules: ['dashboard','sales','crm','master-data','settings'] }],
      ['PROC_MGR', 'Procurement Manager', true, { all: false, modules: ['dashboard','procurement','inventory','warehouse','master-data','settings'] }],
      ['WH_MGR', 'Warehouse Manager', true, { all: false, modules: ['dashboard','inventory','warehouse','settings'] }],
      ['HR_MGR', 'HR Manager', true, { all: false, modules: ['dashboard','hr','settings'] }],
      ['PROD_PLAN', 'Production Planner', true, { all: false, modules: ['dashboard','production','inventory','quality','maintenance','settings'] }],
      ['EXECUTIVE', 'Executive', true, { all: false, modules: ['dashboard','finance','sales','procurement','inventory','production','hr','crm','projects','assets','settings'] }],
      ['USER', 'Standard User', true, { all: false, modules: ['dashboard','settings'] }],
    ];
    for (const [code, name, sys, perms] of roles) {
      await client.query(`INSERT INTO sys_roles (role_code, role_name, is_system, permissions) VALUES ($1,$2,$3,$4) ON CONFLICT (role_code) DO NOTHING`, [code, name, sys, JSON.stringify(perms)]);
    }

    // ==========================================
    // ADMIN USER (only user created)
    // ==========================================
    const adminRoleRes = await client.query(`SELECT id FROM sys_roles WHERE role_code='ADMIN'`);
    const hash = await bcrypt.hash('admin123', 12);
    await client.query(
      `INSERT INTO sys_users (username,email,password_hash,first_name,last_name,role_id,status)
       VALUES ('admin','admin@zyra.com',$1,'System','Administrator',$2,'active')
       ON CONFLICT (username) DO NOTHING`,
      [hash, adminRoleRes.rows[0].id]
    );

    // ==========================================
    // MODULE CONFIG (required for sidebar)
    // ==========================================
    const modules = [
      ['dashboard','Dashboard','📊','core',true,true,1],
      ['finance','Finance','💰','core',true,true,2],
      ['sales','Sales & Distribution','📈','core',true,true,3],
      ['master-data','Master Data','📋','core',true,true,4],
      ['inventory','Inventory','📦','core',true,true,5],
      ['settings','Settings & Admin','⚙️','core',true,true,100],
      ['procurement','Procurement','🛒','optional',false,true,6],
      ['production','Production Planning','🏭','optional',false,true,7],
      ['warehouse','Warehouse Management','🏬','optional',false,true,8],
      ['assets','Asset Management','🖥️','optional',false,true,9],
      ['hr','Human Resources','👥','optional',false,true,10],
      ['crm','CRM','🤝','optional',false,true,11],
      ['projects','Project System','📁','optional',false,true,12],
      ['quality','Quality Management','✅','optional',false,true,13],
      ['maintenance','Plant Maintenance','🔧','optional',false,true,14],
      ['transport','Transport Management','🚚','optional',false,true,15],
    ];
    for (const [key,name,icon,cat,mandatory,enabled,sort] of modules) {
      await client.query(`INSERT INTO sys_module_config (module_key,module_name,icon,category,is_mandatory,is_enabled,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (module_key) DO UPDATE SET is_enabled=$6`, [key,name,icon,cat,mandatory,enabled,sort]);
    }

    // ==========================================
    // CURRENCIES (reference data)
    // ==========================================
    const currencies = [
      ['INR','Indian Rupee','₹',2],['USD','US Dollar','$',2],['EUR','Euro','€',2],
      ['GBP','British Pound','£',2],['JPY','Japanese Yen','¥',0],['CNY','Chinese Yuan','¥',2],
      ['AED','UAE Dirham','د.إ',2],['SGD','Singapore Dollar','S$',2],['AUD','Australian Dollar','A$',2],
      ['CAD','Canadian Dollar','C$',2],
    ];
    for (const [code,name,sym,dec] of currencies) {
      await client.query(`INSERT INTO fi_currencies (currency_code,currency_name,symbol,decimal_places) VALUES ($1,$2,$3,$4) ON CONFLICT (currency_code) DO NOTHING`, [code,name,sym,dec]);
    }

    // ==========================================
    // PAYMENT TERMS (reference data)
    // ==========================================
    const terms = [['NET30','Net 30 Days',30],['NET60','Net 60 Days',60],['NET15','Net 15 Days',15],['COD','Cash on Delivery',0],['NET45','Net 45 Days',45],['NET90','Net 90 Days',90]];
    for (const [code,name,days] of terms) {
      await client.query(`INSERT INTO fi_payment_terms (term_code,term_name,days_net) VALUES ($1,$2,$3) ON CONFLICT (term_code) DO NOTHING`, [code,name,days]);
    }

    // ==========================================
    // MATERIAL TYPES (reference data)
    // ==========================================
    const matTypes = [
      ['FERT','Finished Product',true,false,true,false],
      ['ROH','Raw Material',true,true,false,false],
      ['HALB','Semi-Finished',true,true,false,true],
      ['DIEN','Service',false,true,true,false],
      ['HIBE','Operating Supplies',true,true,false,false],
    ];
    for (const [code,name,stk,pur,sold,prod] of matTypes) {
      await client.query(`INSERT INTO mm_material_types (type_code,type_name,is_stocked,is_purchased,is_sold,is_produced) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (type_code) DO NOTHING`, [code,name,stk,pur,sold,prod]);
    }

    // ==========================================
    // UNITS OF MEASURE (reference data)
    // ==========================================
    const uoms = [['EA','Each','quantity'],['KG','Kilogram','weight'],['LTR','Liter','volume'],['MTR','Meter','length'],['BOX','Box','quantity'],['SET','Set','quantity'],['HRS','Hours','time'],['PCS','Pieces','quantity'],['TON','Metric Ton','weight'],['SQM','Square Meter','area']];
    for (const [code,name,type] of uoms) {
      await client.query(`INSERT INTO mm_units_of_measure (uom_code,uom_name,uom_type) VALUES ($1,$2,$3) ON CONFLICT (uom_code) DO NOTHING`, [code,name,type]);
    }

    // ==========================================
    // MATERIAL GROUPS (reference data)
    // ==========================================
    const groups = [['ELEC','Electronics'],['MECH','Mechanical Parts'],['RAW','Raw Materials'],['PACK','Packaging'],['CHEM','Chemicals'],['SERV','Services']];
    for (const [code,name] of groups) {
      await client.query(`INSERT INTO mm_material_groups (group_code,group_name) VALUES ($1,$2) ON CONFLICT (group_code) DO NOTHING`, [code,name]);
    }

    // ==========================================
    // LEAVE TYPES (reference data)
    // ==========================================
    const leaveTypes = [['AL','Annual Leave',20,true],['SL','Sick Leave',10,true],['CL','Casual Leave',5,true],['UL','Unpaid Leave',0,false],['ML','Maternity Leave',180,true],['PL','Paternity Leave',15,true]];
    for (const [code,name,days,paid] of leaveTypes) {
      await client.query(`INSERT INTO hr_leave_types (type_code,type_name,days_per_year,is_paid) VALUES ($1,$2,$3,$4) ON CONFLICT (type_code) DO NOTHING`, [code,name,days,paid]);
    }

    // ==========================================
    // ASSET CLASSES (reference data)
    // ==========================================
    const assetClasses = [
      ['BLDG','Buildings','straight_line',30],['MACH','Machinery','straight_line',10],
      ['VEHI','Vehicles','declining_balance',5],['OFUR','Office Furniture','straight_line',7],
      ['ITEQ','IT Equipment','straight_line',3],['LAND','Land','none',0],
    ];
    for (const [code,name,method,life] of assetClasses) {
      await client.query(`INSERT INTO am_asset_classes (class_code,class_name,depreciation_method,useful_life_years) VALUES ($1,$2,$3,$4) ON CONFLICT (class_code) DO NOTHING`, [code,name,method,life]);
    }

    // ==========================================
    // SYSTEM CONFIG (app settings)
    // ==========================================
    const configs = [
      ['app.name','Zyra','general'],['app.version','2.0.0','general'],
      ['app.currency','INR','finance'],['app.tax_inclusive','false','finance'],
      ['app.date_format','DD-MM-YYYY','general'],['app.fiscal_year_start','4','finance'],
    ];
    for (const [key,val,group] of configs) {
      await client.query(`INSERT INTO sys_config (config_key,config_value,config_group) VALUES ($1,$2,$3) ON CONFLICT (config_key) DO NOTHING`, [key,val,group]);
    }
  });

  console.log('✅ Seed data complete');
  console.log('');
  console.log('   Created: admin / admin123');
  console.log('   Created: 9 roles, 16 modules, 25 number ranges');
  console.log('   Created: 10 currencies, 6 payment terms, 10 UoMs, 5 material types, 6 material groups');
  console.log('   Created: 6 leave types, 6 asset classes');
  console.log('');
  console.log('   NOT created (you do this): companies, plants, storage locations, GL accounts, departments, users, materials, business partners');
}

export default seedDatabase;

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { hasRouteAccess } from './utils/permissions';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BusinessPartnersPage from './pages/BusinessPartnersPage';
import MaterialsPage from './pages/MaterialsPage';
import MaterialConfig from './pages/MaterialConfig';
import ServicesPage from './pages/ServicesPage';
import OrganizationPage from './pages/OrganizationPage';
import SettingsPage from './pages/SettingsPage';
import ModulePlaceholder from './pages/ModulePlaceholder';
import AccessDeniedPage from './pages/AccessDeniedPage';
import FinanceOverview from './pages/finance/FinanceOverview';
import JournalEntries from './pages/finance/JournalEntries';
import GLAccounts from './pages/finance/GLAccounts';
import GLMapping from './pages/finance/GLMapping';
import PettyCash from './pages/finance/PettyCash';
import APInvoices from './pages/finance/APInvoices';
import ARInvoices from './pages/finance/ARInvoices';
import Payments from './pages/finance/Payments';
import FinancialReports from './pages/finance/FinancialReports';
import AgingReports from './pages/finance/AgingReports';
import CashFlowForecast from './pages/finance/CashFlowForecast';
import BankReconciliation from './pages/finance/BankReconciliation';
import FinanceAdvanced from './pages/finance/FinanceAdvanced';
import BudgetPage from './pages/finance/BudgetPage';
import ExpenseClaims from './pages/hr/ExpenseClaims';
import SalesOverview from './pages/sales/SalesOverview';
import Quotations from './pages/sales/Quotations';
import SalesOrders from './pages/sales/SalesOrders';
import Deliveries from './pages/sales/Deliveries';
import SalesBilling from './pages/sales/Billing';
import ReturnsPricing from './pages/sales/ReturnsPricing';
import CRMPage from './pages/crm/CRMPage';
import ProcurementOverview from './pages/procurement/ProcurementOverview';
import Requisitions from './pages/procurement/Requisitions';
import SupplierQuotations from './pages/procurement/SupplierQuotations';
import PurchaseOrders from './pages/procurement/PurchaseOrders';
import GoodsReceipts from './pages/procurement/GoodsReceipts';
import StockOverview from './pages/inventory/StockOverview';
import StockMovements from './pages/inventory/StockMovements';
import InventoryTurnover from './pages/inventory/InventoryTurnover';
import ProductionOverview from './pages/production/ProductionOverview';
import BOMPage from './pages/production/BOMPage';
import ProductionOrders from './pages/production/ProductionOrders';
import MRPPage from './pages/production/MRPPage';
import WorkCenters from './pages/production/WorkCenters';
import RoutingPage from './pages/production/RoutingPage';
import HROverview from './pages/hr/HROverview';
import Employees from './pages/hr/Employees';
import LeaveManagement from './pages/hr/LeaveManagement';
import Attendance from './pages/hr/Attendance';
import PayrollPage from './pages/hr/PayrollPage';
import AssetsPage from './pages/assets/AssetsPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import MaintenancePage from './pages/maintenance/MaintenancePage';
import QualityPage from './pages/quality/QualityPage';
import WarehousePage from './pages/warehouse/WarehousePage';
import WorkflowPage from './pages/admin/WorkflowPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import ReportBuilder from './pages/admin/ReportBuilder';
import AdminConfig from './pages/admin/AdminConfig';
import GoLiveSettings from './pages/admin/GoLiveSettings';
import UserManagement from './pages/admin/UserManagement';
import IntegrationHub from './pages/admin/IntegrationHub';
import ModuleConfig from './pages/admin/ModuleConfig';
import AdminPlatform from './pages/admin/AdminPlatform';
import PrintBuilder from './pages/admin/PrintBuilder';
import BarcodeHub from './pages/admin/BarcodeHub';
import EnhancedAdmin from './pages/admin/EnhancedAdmin';
import ModuleSettings from './pages/settings/ModuleSettings';
import ConfigurationPage from './pages/ConfigurationPage';
import TransportPage from './pages/transport/TransportPage';
import GatePasses from './pages/logistics/GatePasses';
import { PageLoader } from './components/common/index';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleGuard({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!hasRouteAccess(user, location.pathname)) return <AccessDeniedPage />;
  return children;
}

function ModuleRoute({ children }) {
  return <RoleGuard>{children}</RoleGuard>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><PageLoader /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />

        {/* Master Data */}
        <Route path="master/business-partners" element={<ModuleRoute><BusinessPartnersPage /></ModuleRoute>} />
        <Route path="master/materials" element={<ModuleRoute><MaterialsPage /></ModuleRoute>} />
        <Route path="master/material-config" element={<ModuleRoute><MaterialConfig /></ModuleRoute>} />
        <Route path="master/services" element={<ModuleRoute><ServicesPage /></ModuleRoute>} />
        <Route path="master/organization" element={<ModuleRoute><OrganizationPage /></ModuleRoute>} />

        {/* Configuration */}
        <Route path="configuration" element={<ModuleRoute><ConfigurationPage /></ModuleRoute>} />

        {/* Settings & Admin */}
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/workflows" element={<WorkflowPage />} />
        <Route path="settings/audit-log" element={<AuditLogPage />} />
        <Route path="settings/reports" element={<ReportBuilder />} />
        <Route path="settings/config" element={<AdminConfig />} />
        <Route path="settings/go-live" element={<GoLiveSettings />} />
        <Route path="settings/users" element={<UserManagement />} />
        <Route path="settings/integrations" element={<IntegrationHub />} />
        <Route path="settings/modules" element={<ModuleConfig />} />
        <Route path="settings/module-settings" element={<ModuleSettings />} />
        <Route path="settings/platform" element={<AdminPlatform />} />
        <Route path="settings/print-builder/:id" element={<PrintBuilder />} />
        <Route path="settings/print-builder" element={<PrintBuilder />} />
        <Route path="settings/barcode" element={<BarcodeHub />} />
        <Route path="settings/enhanced" element={<EnhancedAdmin />} />

        {/* Finance */}
        <Route path="finance" element={<ModuleRoute><FinanceOverview /></ModuleRoute>} />
        <Route path="finance/gl-accounts" element={<ModuleRoute><GLAccounts /></ModuleRoute>} />
        <Route path="finance/gl-mapping" element={<ModuleRoute><GLMapping /></ModuleRoute>} />
        <Route path="finance/petty-cash" element={<ModuleRoute><PettyCash /></ModuleRoute>} />
        <Route path="finance/journals" element={<ModuleRoute><JournalEntries /></ModuleRoute>} />
        <Route path="finance/ap" element={<ModuleRoute><APInvoices /></ModuleRoute>} />
        <Route path="finance/ar" element={<ModuleRoute><ARInvoices /></ModuleRoute>} />
        <Route path="finance/payments" element={<ModuleRoute><Payments /></ModuleRoute>} />
        <Route path="finance/reports/*" element={<ModuleRoute><FinancialReports /></ModuleRoute>} />
        <Route path="finance/aging" element={<ModuleRoute><AgingReports /></ModuleRoute>} />
        <Route path="finance/cash-flow" element={<ModuleRoute><CashFlowForecast /></ModuleRoute>} />
        <Route path="finance/bank-reconciliation" element={<ModuleRoute><BankReconciliation /></ModuleRoute>} />
        <Route path="finance/advanced" element={<ModuleRoute><FinanceAdvanced /></ModuleRoute>} />
        <Route path="finance/budget" element={<ModuleRoute><BudgetPage /></ModuleRoute>} />
        <Route path="hr/expenses" element={<ModuleRoute><ExpenseClaims /></ModuleRoute>} />

        {/* Sales */}
        <Route path="sales" element={<ModuleRoute><SalesOverview /></ModuleRoute>} />
        <Route path="sales/quotations" element={<ModuleRoute><Quotations /></ModuleRoute>} />
        <Route path="sales/orders" element={<ModuleRoute><SalesOrders /></ModuleRoute>} />
        <Route path="sales/deliveries" element={<ModuleRoute><Deliveries /></ModuleRoute>} />
        <Route path="sales/billing" element={<ModuleRoute><SalesBilling /></ModuleRoute>} />
        <Route path="sales/returns-pricing" element={<ModuleRoute><ReturnsPricing /></ModuleRoute>} />

        {/* CRM */}
        <Route path="crm" element={<ModuleRoute><CRMPage /></ModuleRoute>} />
        <Route path="crm/*" element={<ModuleRoute><CRMPage /></ModuleRoute>} />

        {/* Procurement */}
        <Route path="procurement" element={<ModuleRoute><ProcurementOverview /></ModuleRoute>} />
        <Route path="procurement/requisitions" element={<ModuleRoute><Requisitions /></ModuleRoute>} />
        <Route path="procurement/quotations" element={<ModuleRoute><SupplierQuotations /></ModuleRoute>} />
        <Route path="procurement/orders" element={<ModuleRoute><PurchaseOrders /></ModuleRoute>} />
        <Route path="procurement/goods-receipts" element={<ModuleRoute><GoodsReceipts /></ModuleRoute>} />

        {/* Inventory */}
        <Route path="inventory" element={<ModuleRoute><StockOverview /></ModuleRoute>} />
        <Route path="inventory/movements" element={<ModuleRoute><StockMovements /></ModuleRoute>} />
        <Route path="inventory/turnover" element={<ModuleRoute><InventoryTurnover /></ModuleRoute>} />

        {/* Production */}
        <Route path="production" element={<ModuleRoute><ProductionOverview /></ModuleRoute>} />
        <Route path="production/bom" element={<ModuleRoute><BOMPage /></ModuleRoute>} />
        <Route path="production/orders" element={<ModuleRoute><ProductionOrders /></ModuleRoute>} />
        <Route path="production/mrp" element={<ModuleRoute><MRPPage /></ModuleRoute>} />
        <Route path="production/work-centers" element={<ModuleRoute><WorkCenters /></ModuleRoute>} />
        <Route path="production/routing" element={<ModuleRoute><RoutingPage /></ModuleRoute>} />

        {/* Warehouse */}
        <Route path="warehouse" element={<ModuleRoute><WarehousePage /></ModuleRoute>} />
        <Route path="warehouse/*" element={<ModuleRoute><WarehousePage /></ModuleRoute>} />

        {/* Assets */}
        <Route path="assets" element={<ModuleRoute><AssetsPage /></ModuleRoute>} />
        <Route path="assets/*" element={<ModuleRoute><AssetsPage /></ModuleRoute>} />

        {/* HR */}
        <Route path="hr" element={<ModuleRoute><HROverview /></ModuleRoute>} />
        <Route path="hr/employees" element={<ModuleRoute><Employees /></ModuleRoute>} />
        <Route path="hr/leave" element={<ModuleRoute><LeaveManagement /></ModuleRoute>} />
        <Route path="hr/attendance" element={<ModuleRoute><Attendance /></ModuleRoute>} />
        <Route path="hr/payroll" element={<ModuleRoute><PayrollPage /></ModuleRoute>} />

        {/* Projects */}
        <Route path="projects" element={<ModuleRoute><ProjectsPage /></ModuleRoute>} />
        <Route path="projects/*" element={<ModuleRoute><ProjectsPage /></ModuleRoute>} />

        {/* Quality */}
        <Route path="quality" element={<ModuleRoute><QualityPage /></ModuleRoute>} />
        <Route path="quality/*" element={<ModuleRoute><QualityPage /></ModuleRoute>} />

        {/* Maintenance */}
        <Route path="maintenance" element={<ModuleRoute><MaintenancePage /></ModuleRoute>} />
        <Route path="maintenance/*" element={<ModuleRoute><MaintenancePage /></ModuleRoute>} />

        {/* Transport */}
        <Route path="transport" element={<ModuleRoute><TransportPage /></ModuleRoute>} />
        <Route path="transport/*" element={<ModuleRoute><TransportPage /></ModuleRoute>} />
        <Route path="logistics/gate-passes" element={<ModuleRoute><GatePasses /></ModuleRoute>} />
        <Route path="logistics/gate-passes/*" element={<ModuleRoute><GatePasses /></ModuleRoute>} />

        {/* Catch all */}
        <Route path="*" element={<ModulePlaceholder />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

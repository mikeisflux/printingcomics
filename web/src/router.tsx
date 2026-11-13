import { createBrowserRouter } from 'react-router-dom';
import { StoreLayout } from './components/StoreLayout';
import { NotFound } from './pages/NotFound';
import { AdminLayout } from './components/AdminLayout';

import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { ShippingSupplies } from './pages/ShippingSupplies';
import { AdjustmentPay } from './pages/AdjustmentPay';
import { CategoryConfigure } from './pages/CategoryConfigure';
import { Product } from './pages/Product';
import { CartPage } from './pages/CartPage';
import { PaypalCheckout } from './pages/PaypalCheckout';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AccountLayout, AccountDashboard, AccountProfile, AccountPassword, AccountAddresses } from './pages/Account';
import { OrdersPage } from './pages/OrdersPage';
import { AccountProofs } from './pages/AccountProofs';
import { AccountSetup } from './pages/AccountSetup';
import { PaypalReturn } from './pages/PaypalReturn';
import {
  About,
  Contact,
  Crowdfunding,
  Faq,
  Media,
  SamplePack,
  Terms,
} from './pages/StaticPages';
import { Templates } from './pages/resources/Templates';
import { MakeAComic } from './pages/resources/MakeAComic';
import { FilePrep } from './pages/resources/FilePrep';
import { Developers } from './pages/Developers';
import { ProofReview } from './pages/ProofReview';
import { ReviewForm } from './pages/ReviewForm';
import { CorrectedUpload } from './pages/CorrectedUpload';
import { AccountOrder } from './pages/AccountOrder';
import { ContentPage } from './pages/ContentPage';

import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminProducts } from './pages/admin/Products';
import { AdminProductEdit } from './pages/admin/ProductEdit';
import { AdminOrders } from './pages/admin/Orders';
import { AdminOrderDetail } from './pages/admin/OrderDetail';
import { AdminOrderNew } from './pages/admin/OrderNew';
import { AdminUsers } from './pages/admin/Users';
import { AdminUserEdit } from './pages/admin/UserEdit';
import { AdminCategories } from './pages/admin/Categories';
import { AdminSettings } from './pages/admin/Settings';
import { AdminSeo } from './pages/admin/Seo';
import { AdminSeoDetail } from './pages/admin/SeoDetail';
import { AdminEmail } from './pages/admin/Email';
import { AdminEmailTemplateEdit } from './pages/admin/EmailTemplateEdit';
import { AdminEmailCampaignEdit } from './pages/admin/EmailCampaignEdit';
import { AdminSecurity } from './pages/admin/Security';
import { AdminMedia } from './pages/admin/Media';
import { AdminFulfillment } from './pages/admin/Fulfillment';
import { AdminApiKeys } from './pages/admin/ApiKeys';
import { AdminPartners } from './pages/admin/Partners';
import { AdminPartnerDetail } from './pages/admin/PartnerDetail';
import { AdminSiteDiscounts } from './pages/admin/SiteDiscounts';
import { AdminCoupons } from './pages/admin/Coupons';
import { AdminReviews } from './pages/admin/Reviews';

import { PrintOnDemand } from './pages/pod/PrintOnDemand';
import { PodCatalog } from './pages/pod/PodCatalog';
import { PodTitle } from './pages/pod/PodTitle';
import { PodApply } from './pages/pod/PodApply';
import { PublisherLayout, PublisherDashboard, PublisherListings, PublisherListingEdit, PublisherPurchaseOrders, PublisherStatements } from './pages/pod/PublisherPortal';
import { RetailerLayout, RetailerDashboard, RetailerOrders } from './pages/pod/RetailerPortal';
import { RetailerCatalog } from './pages/pod/RetailerCatalog';
import { RetailerProfile, RetailerDownloads, RetailerReturns, RetailerShipments } from './pages/pod/RetailerPortalMore';
import { PublisherFiles, PublisherProfile, PublisherBarcodes, PublisherPrintOrders, PublisherResources } from './pages/pod/PublisherPortalMore';
import { Navigate } from 'react-router-dom';
import { PodLayout } from './pages/admin/pod/PodLayout';
import { PodDashboard } from './pages/admin/pod/PodDashboard';
import { PodListings, PodListingDetail } from './pages/admin/pod/PodListings';
import { PodCycles, PodCycleDetail } from './pages/admin/pod/PodCycles';
import { PodRetailers, PodRetailerDetail } from './pages/admin/pod/PodRetailers';
import { PodProduction, PodPurchaseOrders } from './pages/admin/pod/PodProduction';
import { PodPayouts } from './pages/admin/pod/PodPayouts';
import { PodPreflight } from './pages/admin/pod/PodPreflight';
import { PodSettings } from './pages/admin/pod/PodSettings';
import { PodPublishers, PodPublisherDetail } from './pages/admin/pod/PodPublishers';
import { PodOrders, PodFulfillment } from './pages/admin/pod/PodOrders';
import { PodReturns, PodFiles, PodBarcodes, PodInventory, PodAnalytics, PodActivity } from './pages/admin/pod/PodMore';
import { PodCatalogPrint } from './pages/admin/pod/PodCatalogPrint';
import { PublisherHandbook } from './pages/pod/PublisherHandbook';
import { PodPublisherPage } from './pages/pod/PodPublisherPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StoreLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
      // Stock goods (mailers, packaging) are bought off a normal product grid —
      // they have no artwork, proofs or file prep, so they must NOT go through
      // the print configurator that every made-to-order category uses.
      { path: 'shop/shipping-supplies', element: <ShippingSupplies /> },
      // Search-landing pages: their words come from the API and are also
      // rendered server-side for crawlers (server/src/lib/seo-content.ts).
      { path: 'comic-book-mailers', element: <ContentPage slug="comic-book-mailers" /> },
      { path: 'resources/how-to-ship-comic-books', element: <ContentPage slug="how-to-ship-comic-books" /> },
      { path: 'shop/:category', element: <CategoryConfigure /> },
      { path: 'product/:slug', element: <Product /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <PaypalCheckout /> },
      { path: 'checkout/paypal/return', element: <PaypalReturn /> },
      { path: 'order/:number', element: <OrderConfirmation /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password', element: <ResetPassword /> },
      // Outside the account shell: it is the gate that shell sends
      // password-less accounts through.
      { path: 'account/setup', element: <AccountSetup /> },
      {
        path: 'account',
        element: <AccountLayout />,
        children: [
          { index: true, element: <AccountDashboard /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:number', element: <AccountOrder /> },
          { path: 'proofs', element: <AccountProofs /> },
          { path: 'profile', element: <AccountProfile /> },
          { path: 'addresses', element: <AccountAddresses /> },
          { path: 'password', element: <AccountPassword /> },
        ],
      },
      { path: 'crowdfunding', element: <Crowdfunding /> },
      // Print On Demand: the programme page, catalog, applications, and the
      // publisher and retailer portals (styles/pod.css, lib/pod.ts).
      { path: 'print-on-demand', element: <PrintOnDemand /> },
      { path: 'print-on-demand/catalog', element: <PodCatalog /> },
      { path: 'print-on-demand/catalog/:key', element: <PodTitle /> },
      { path: 'print-on-demand/apply', element: <PodApply /> },
      { path: 'print-on-demand/handbook', element: <PublisherHandbook /> },
      { path: 'print-on-demand/publishers/:slug', element: <PodPublisherPage /> },
      {
        path: 'publisher',
        element: <PublisherLayout />,
        children: [
          { index: true, element: <PublisherDashboard /> },
          { path: 'listings', element: <PublisherListings /> },
          { path: 'listings/:id', element: <PublisherListingEdit /> },
          { path: 'purchase-orders', element: <PublisherPurchaseOrders /> },
          { path: 'purchase-orders/:id', element: <PublisherPurchaseOrders /> },
          { path: 'statements', element: <PublisherStatements /> },
          { path: 'statements/:id', element: <PublisherStatements /> },
          { path: 'files', element: <PublisherFiles /> },
          { path: 'assets', element: <PublisherProfile /> },
          { path: 'barcodes', element: <PublisherBarcodes /> },
          { path: 'print-orders', element: <PublisherPrintOrders /> },
          { path: 'resources', element: <PublisherResources /> },
        ],
      },
      // The portal used to live at /partner.
      { path: 'partner/*', element: <Navigate to="/publisher" replace /> },
      {
        path: 'retailer',
        element: <RetailerLayout />,
        children: [
          { index: true, element: <RetailerDashboard /> },
          { path: 'catalog', element: <RetailerCatalog /> },
          { path: 'orders', element: <RetailerOrders /> },
          { path: 'orders/:number', element: <RetailerOrders /> },
          { path: 'returns', element: <RetailerReturns /> },
          { path: 'shipments', element: <RetailerShipments /> },
          { path: 'downloads', element: <RetailerDownloads /> },
          { path: 'profile', element: <RetailerProfile /> },
        ],
      },
      { path: 'about', element: <About /> },
      { path: 'terms', element: <Terms /> },
      { path: 'contact', element: <Contact /> },
      { path: 'media', element: <Media /> },
      { path: 'sample-pack', element: <SamplePack /> },
      { path: 'resources/make-a-comic', element: <MakeAComic /> },
      { path: 'resources/file-prep', element: <FilePrep /> },
      { path: 'resources/templates', element: <Templates /> },
      { path: 'resources/faq', element: <Faq /> },
      { path: 'developers', element: <Developers /> },
      { path: 'proof/:token', element: <ProofReview /> },
      { path: 'review/:token', element: <ReviewForm /> },
      { path: 'pay/:token', element: <AdjustmentPay /> },
      { path: 'upload/:token', element: <CorrectedUpload /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'products', element: <AdminProducts /> },
      { path: 'products/new', element: <AdminProductEdit /> },
      { path: 'products/:id', element: <AdminProductEdit /> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'orders/new', element: <AdminOrderNew /> },
      { path: 'orders/:id', element: <AdminOrderDetail /> },
      { path: 'customers', element: <AdminUsers mode="customers" /> },
      { path: 'customers/:id', element: <AdminUserEdit /> },
      { path: 'users', element: <AdminUsers /> },
      { path: 'users/:id', element: <AdminUserEdit /> },
      { path: 'categories', element: <AdminCategories /> },
      { path: 'seo', element: <AdminSeo /> },
      { path: 'seo/:productId', element: <AdminSeoDetail /> },
      { path: 'email', element: <AdminEmail /> },
      { path: 'email/templates/:id', element: <AdminEmailTemplateEdit /> },
      { path: 'email/campaigns/:id', element: <AdminEmailCampaignEdit /> },
      { path: 'media', element: <AdminMedia /> },
      { path: 'fulfillment', element: <AdminFulfillment /> },
      { path: 'security', element: <AdminSecurity /> },
      { path: 'api-keys', element: <AdminApiKeys /> },
      {
        path: 'pod',
        element: <PodLayout />,
        children: [
          { index: true, element: <PodDashboard /> },
          { path: 'listings', element: <PodListings /> },
          { path: 'listings/:id', element: <PodListingDetail /> },
          { path: 'cycles', element: <PodCycles /> },
          { path: 'cycles/:id', element: <PodCycleDetail /> },
          { path: 'retailers', element: <PodRetailers /> },
          { path: 'retailers/:id', element: <PodRetailerDetail /> },
          { path: 'production', element: <PodProduction /> },
          { path: 'purchase-orders', element: <PodPurchaseOrders /> },
          { path: 'payouts', element: <PodPayouts /> },
          { path: 'preflight', element: <PodPreflight /> },
          { path: 'settings', element: <PodSettings /> },
          { path: 'publishers', element: <PodPublishers /> },
          { path: 'publishers/:id', element: <PodPublisherDetail /> },
          { path: 'orders', element: <PodOrders /> },
          { path: 'fulfillment', element: <PodFulfillment /> },
          { path: 'inventory', element: <PodInventory /> },
          { path: 'returns', element: <PodReturns /> },
          { path: 'files', element: <PodFiles /> },
          { path: 'barcodes', element: <PodBarcodes /> },
          { path: 'analytics', element: <PodAnalytics /> },
          { path: 'activity', element: <PodActivity /> },
          { path: 'cycles/:id/print', element: <PodCatalogPrint /> },
        ],
      },
      { path: 'partners', element: <AdminPartners /> },
      { path: 'partners/:id', element: <AdminPartnerDetail /> },
      { path: 'settings', element: <AdminSettings /> },
      { path: 'sitediscounts', element: <AdminSiteDiscounts /> },
      { path: 'coupons', element: <AdminCoupons /> },
      { path: 'reviews', element: <AdminReviews /> },
    ],
  },
  { path: '*', element: <StoreLayout />, children: [{ index: true, element: <NotFound /> }] },
]);

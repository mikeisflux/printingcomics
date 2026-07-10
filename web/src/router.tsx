import { createBrowserRouter } from 'react-router-dom';
import { StoreLayout } from './components/StoreLayout';
import { NotFound } from './pages/NotFound';
import { AdminLayout } from './components/AdminLayout';

import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
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
import { PaypalReturn } from './pages/PaypalReturn';
import {
  About,
  Contact,
  Crowdfunding,
  Faq,
  FilePrep,
  MakeAComic,
  Media,
  SamplePack,
  Templates,
  Terms,
} from './pages/StaticPages';
import { Developers } from './pages/Developers';

import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminProducts } from './pages/admin/Products';
import { AdminProductEdit } from './pages/admin/ProductEdit';
import { AdminOrders } from './pages/admin/Orders';
import { AdminOrderDetail } from './pages/admin/OrderDetail';
import { AdminCustomers } from './pages/admin/Customers';
import { AdminUserDetail } from './pages/admin/UserDetail';
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StoreLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
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
      {
        path: 'account',
        element: <AccountLayout />,
        children: [
          { index: true, element: <AccountDashboard /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'profile', element: <AccountProfile /> },
          { path: 'addresses', element: <AccountAddresses /> },
          { path: 'password', element: <AccountPassword /> },
        ],
      },
      { path: 'crowdfunding', element: <Crowdfunding /> },
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
      { path: 'orders/:id', element: <AdminOrderDetail /> },
      { path: 'customers', element: <AdminCustomers /> },
      { path: 'customers/:id', element: <AdminUserDetail /> },
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
      { path: 'partners', element: <AdminPartners /> },
      { path: 'partners/:id', element: <AdminPartnerDetail /> },
      { path: 'settings', element: <AdminSettings /> },
      { path: 'sitediscounts', element: <AdminSiteDiscounts /> },
      { path: 'coupons', element: <AdminCoupons /> },
    ],
  },
  { path: '*', element: <StoreLayout />, children: [{ index: true, element: <NotFound /> }] },
]);

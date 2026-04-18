import { createBrowserRouter, Navigate } from 'react-router-dom';
import { StoreLayout } from './components/StoreLayout';
import { AdminLayout } from './components/AdminLayout';

import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { Product } from './pages/Product';
import { CartPage } from './pages/CartPage';
import { Checkout } from './pages/Checkout';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Account } from './pages/Account';
import { OrdersPage } from './pages/OrdersPage';

import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminProducts } from './pages/admin/Products';
import { AdminProductEdit } from './pages/admin/ProductEdit';
import { AdminOrders } from './pages/admin/Orders';
import { AdminOrderDetail } from './pages/admin/OrderDetail';
import { AdminCustomers } from './pages/admin/Customers';
import { AdminCategories } from './pages/admin/Categories';
import { AdminSettings } from './pages/admin/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StoreLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'shop', element: <Shop /> },
      { path: 'shop/:category', element: <Shop /> },
      { path: 'product/:slug', element: <Product /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <Checkout /> },
      { path: 'order/:number', element: <OrderConfirmation /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'account', element: <Account /> },
      { path: 'account/orders', element: <OrdersPage /> },
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
      { path: 'categories', element: <AdminCategories /> },
      { path: 'settings', element: <AdminSettings /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

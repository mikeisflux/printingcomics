import React, { useState, useEffect } from 'react';
import {
  BadgeCheck, BarChart3, Bell, BookOpen, Calendar, ClipboardList, Contact, CreditCard, Download,
  FileCheck, FileText, HelpCircle, History, Home as HomeIcon, Image as ImageIcon, LayoutDashboard, Library, ListChecks,
  ListPlus, LogOut, Menu, Package, PlusCircle, Printer, RefreshCw, Search, Settings, ShieldCheck,
  ShoppingCart, TrendingUp, Truck, User, Users
} from 'lucide-react';
import { db, canAccessSection, isProtectedDemoEnvironment, ROLE_LABELS } from './firebase-mock';
import { checkSupabaseConnection, isProductionBackendEnabled, isSupabaseConfigured } from './lib/supabase';
import { loadAdminAttentionQueue, restorePortalSession, signOutOfPortal } from './lib/backend';
import { CATALOG_PATH, getCatalogProductIdFromPath } from './lib/catalog-routes';
import { summarizeAttentionBySection } from './lib/attention-center';
import Home from './pages/Home';
import Services from './pages/Services';
import Apply from './pages/Apply';
import Login from './pages/Login';
import RetailerPortal from './pages/RetailerPortal';
import PublisherPortal from './pages/PublisherPortal';
import AdminPortal from './pages/AdminPortal';
import PublisherGuide from './pages/PublisherGuide';
import AudiencePage from './pages/AudiencePage';
import PodPortal from './pages/PodPortal';
import PublicCatalog from './pages/PublicCatalog';
import PreflightPortal from './pages/PreflightPortal';
import MoosAccess from './pages/MoosAccess';
import DemoAccess from './pages/DemoAccess';
import { PrivacyPolicy, TermsOfService } from './pages/LegalPage';

const Icon = ({ name, size = 16, color = 'currentColor', style = {} }) => {
  const icons = {
    'badge-check': BadgeCheck, 'bar-chart-3': BarChart3, bell: Bell, 'book-open': BookOpen, calendar: Calendar,
    'clipboard-list': ClipboardList, contact: Contact, 'credit-card': CreditCard, download: Download,
    'file-check': FileCheck, 'file-text': FileText, 'help-circle': HelpCircle, history: History, home: HomeIcon, image: ImageIcon,
    'layout-dashboard': LayoutDashboard, library: Library, 'list-checks': ListChecks, 'list-plus': ListPlus,
    'log-out': LogOut, menu: Menu, package: Package, 'plus-circle': PlusCircle, printer: Printer,
    'refresh-cw': RefreshCw, search: Search, settings: Settings, 'shield-check': ShieldCheck,
    'shopping-cart': ShoppingCart, 'trending-up': TrendingUp, truck: Truck, user: User, users: Users
  };
  const LucideIcon = icons[name];
  return LucideIcon
    ? <LucideIcon size={size} color={color} strokeWidth={2} style={style} aria-hidden="true" />
    : <span style={{ width: `${size}px`, height: `${size}px`, display: 'inline-flex', ...style }} aria-hidden="true" />;
};

export default function App() {
  const assetPath = (path) => `${window.location.protocol === 'file:' ? './public/assets' : '/assets'}/${path}`;
  const demoEnvironment = isProtectedDemoEnvironment();
  const goDaddyPreviewRoute = window.location.hostname.endsWith('.airoapp.ai') && new URLSearchParams(window.location.search).get('preview') === '1';
  const demoRoute = window.location.hash === '#demo' || (goDaddyPreviewRoute && window.location.hash !== '#home');
  const passwordSetupRoute = new URLSearchParams(window.location.search).has('set_password') || window.location.hash === '#set-password';
  const catalogRoute = window.location.pathname.replace(/\/$/, '') === CATALOG_PATH || Boolean(getCatalogProductIdFromPath(window.location.pathname));
  const publicPath = window.location.pathname.replace(/\/$/, '') || '/';
  const legalRoute = publicPath === '/privacy' ? 'privacy' : publicPath === '/terms' ? 'terms' : null;
  const [currentUser, setCurrentUser] = useState(() => demoRoute || !isProductionBackendEnabled ? db.getCurrentUser() : null);
  const [currentPage, setCurrentPage] = useState(() => passwordSetupRoute && isProductionBackendEnabled ? 'password-setup' : demoRoute ? 'demo-access' : legalRoute || (catalogRoute ? 'public-catalog' : null) || ((!isProductionBackendEnabled && db.getCurrentUser()) ? 'portal' : (window.location.hash === '#staff' ? 'staff-login' : 'home')));
  const [activeSection, setActiveSection] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminAttentionItems, setAdminAttentionItems] = useState([]);
  const adminAttention = summarizeAttentionBySection(adminAttentionItems);
  const handlePrototypeAttentionChange = React.useCallback(items => {
    if (currentUser?.authProvider !== 'supabase') setAdminAttentionItems(items);
  }, [currentUser?.authProvider]);

  useEffect(() => {
    const isAdmin = currentUser && ['admin', 'moos'].includes(currentUser.role);
    if (!isAdmin) {
      setAdminAttentionItems([]);
      return undefined;
    }
    if (currentUser.authProvider !== 'supabase') return undefined;
    let active = true;
    loadAdminAttentionQueue()
      .then(items => { if (active) setAdminAttentionItems(items); })
      .catch(error => {
        if (active) setAdminAttentionItems([]);
        console.warn('Admin attention queue could not be loaded.', error.message);
      });
    return () => { active = false; };
  }, [currentUser, activeSection]);
  const navigateHome = () => {
    if (demoEnvironment) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#home`);
    else if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setCurrentPage('home');
  };
  const navigateCatalog = () => {
    const routeContext = `${window.location.search}${window.location.hash === '#home' ? '#home' : ''}`;
    window.history.pushState(null, '', `${CATALOG_PATH}${routeContext}`);
    setCurrentPage('public-catalog');
  };
  const navigateLegal = (page) => {
    const path = page === 'privacy' ? '/privacy' : '/terms';
    window.history.pushState(null, '', path);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const followPublicPath = () => {
      if (currentUser && currentPage === 'portal') {
        const portalRoute = `/${window.location.search}${demoRoute ? '#demo' : ''}`;
        window.history.replaceState({ philboPortal: true }, '', portalRoute);
        setActiveSection('dashboard');
        setCurrentPage('portal');
        return;
      }
      const path = window.location.pathname.replace(/\/$/, '') || '/';
      if (path === '/privacy') setCurrentPage('privacy');
      else if (path === '/terms') setCurrentPage('terms');
      else if (path === CATALOG_PATH || getCatalogProductIdFromPath(path)) setCurrentPage('public-catalog');
      else if (!currentUser) setCurrentPage('home');
    };
    window.addEventListener('popstate', followPublicPath);
    return () => window.removeEventListener('popstate', followPublicPath);
  }, [currentUser, currentPage, demoRoute]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    checkSupabaseConnection()
      .then(() => console.info('Philbo database connection is healthy.'))
      .catch((error) => console.warn('Philbo database connection check failed.', error.message));
  }, []);

  useEffect(() => {
    if (!isProductionBackendEnabled || demoRoute) return;
    let active = true;
    restorePortalSession()
      .then((user) => {
        if (!active || !user) return;
        setCurrentUser(user);
        if (!new URLSearchParams(window.location.search).has('set_password')) setCurrentPage('portal');
      })
      .catch((error) => console.warn('Philbo session could not be restored.', error.message));
    return () => { active = false; };
  }, [demoRoute]);

  useEffect(() => {
    const followPrivateStaffRoute = () => {
      const isDemoRouteNow = window.location.hash === '#demo'
        || (goDaddyPreviewRoute && window.location.hash !== '#home');
      if (isDemoRouteNow) {
        db.logout();
        setCurrentUser(null);
        setCurrentPage('demo-access');
        return;
      }
      if ((isProductionBackendEnabled && currentUser) || (!isProductionBackendEnabled && db.getCurrentUser())) return;
      if (window.location.hash === '#staff') setCurrentPage('staff-login');
    };
    window.addEventListener('hashchange', followPrivateStaffRoute);
    return () => window.removeEventListener('hashchange', followPrivateStaffRoute);
  }, [currentUser, goDaddyPreviewRoute]);

  useEffect(() => {
    if (isProductionBackendEnabled && !demoRoute) return undefined;
    const revalidate = () => {
      const validUser = db.getCurrentUser();
      setCurrentUser(validUser);
      if (!validUser) { setCurrentPage(window.location.hash === '#staff' ? 'staff-login' : demoRoute ? 'demo-access' : 'login'); setActiveSection('dashboard'); }
    };
    window.addEventListener('philbo:auth-change', revalidate);
    window.addEventListener('storage', revalidate);
    return () => { window.removeEventListener('philbo:auth-change', revalidate); window.removeEventListener('storage', revalidate); };
  }, [demoRoute]);

  useEffect(() => {
    if (currentUser && !canAccessSection(currentUser, activeSection)) setActiveSection('dashboard');
  }, [currentUser, activeSection]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    const pendingCatalogProduct = sessionStorage.getItem('philbo_pending_catalog_product');
    if (pendingCatalogProduct && user.role === 'retailer') {
      sessionStorage.removeItem('philbo_pending_catalog_product');
      window.history.replaceState(null, '', pendingCatalogProduct);
      setCurrentPage('public-catalog');
      setActiveSection('dashboard');
      return;
    }
    setCurrentPage('portal');
    setActiveSection('dashboard');
  };

  const handleLogout = async () => {
    const wasInternal = ['moos', 'admin', 'preflight'].includes(currentUser?.role);
    if (currentUser?.authProvider === 'supabase') await signOutOfPortal();
    else db.logout();
    setCurrentUser(null);
    if (demoRoute) {
      setCurrentPage('demo-access');
    } else if (wasInternal) {
      window.location.hash = 'staff';
      setCurrentPage('staff-login');
    } else {
      setCurrentPage('home');
    }
  };

  const handleSessionUpdate = (updatedUser) => {
    sessionStorage.setItem('philbo_current_user', JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);
  };

  const handleGoToHomepage = () => {
    if (currentUser?.authProvider !== 'supabase') {
      db.logout();
      setCurrentUser(null);
    }
    setActiveSection('dashboard');
    setMobileMenuOpen(false);
    navigateHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRoleSwitch = (nextRole) => {
    if (!(currentUser.roles || [currentUser.role]).includes(nextRole)) return;
    const switchedUser = { ...currentUser, role: nextRole };
    sessionStorage.setItem('philbo_current_user', JSON.stringify(switchedUser));
    setCurrentUser(switchedUser);
    setActiveSection('dashboard');
    setMobileMenuOpen(false);
  };

  // Get current section label for top bar
  const getSectionTitle = () => {
    if (activeSection === 'production-orders' && currentUser?.role === 'preflight') return 'Production Jobs';
    if (activeSection === 'moos-access') return currentUser?.role === 'moos' ? 'MO.OS Access — Internal Staff' : 'Team Access — Internal Staff';
    const titles = {
      dashboard: 'Dashboard Overview',
      catalog: 'Comic Catalog',
      cycles: 'Catalog Cycles Control Center',
      publishers: 'Publishers Registry',
      retailers: 'Retailers Network',
      orders: 'Sales Orders',
      'purchase-orders': 'Purchase Orders Control',
      inventory: 'Inventory & Stock Alerts',
      fulfillment: 'Fulfillment & Labeling',
      returns: 'Returns Processing',
      analytics: 'Operational Insights',
      settings: 'System Settings',
      'retailer-catalog': 'Order Books',
      'current-order': 'Current Order',
      'catalog-downloads': 'Downloads',
      'order-history': 'Past Orders',
      invoices: 'Invoices',
      shipments: 'Shipments',
      'retailer-returns': 'Returns / Damages',
      profile: 'Account / Store Information',
      'pod-accounts': 'POD Applications & Accounts',
      'pod-projects': 'POD Orders & Quotes',
      resources: 'Publisher Resources'
      ,'preflight-queue': 'Preflight Queue'
      ,'production-orders': 'Production Orders'
      ,'file-review': 'File Review'
      ,'approved-files': 'Approved Files'
      ,'my-activity': 'My Activity'
    };
    return titles[activeSection] || 'Operations Console';
  };

  // If logged in, render the persistent Left Sidebar + Top Bar layout
  const renderPortalLayout = () => {
    const portalTheme = currentUser.isPodClient
      ? 'pod-theme'
      : currentUser.role === 'retailer'
        ? 'retailer-theme'
        : ['admin', 'moos', 'preflight'].includes(currentUser.role)
          ? 'admin-theme'
          : 'publisher-theme';
    const portalAccent = 'var(--gold-primary)';
    const portalAccentGlow = 'var(--gold-glow)';
    const portalLogo = currentUser.isPodClient
      ? assetPath('brand/portal-headings/philbo-heading-pod.png')
      : currentUser.role === 'retailer'
        ? assetPath('brand/portal-headings/philbo-heading-retailer.png')
        : currentUser.role === 'publisher'
          ? assetPath('brand/portal-headings/philbo-heading-publisher.png')
          : assetPath('brand/portal-headings/philbo-heading-admin.png');
    const portalLogoAlt = currentUser.isPodClient
      ? 'Philbo POD'
      : currentUser.role === 'retailer'
        ? 'Philbo Retailer'
        : currentUser.role === 'publisher'
          ? 'Philbo Publisher'
          : 'Philbo Admin';
    const navStructure = currentUser.role === 'publisher' && !currentUser.isPodClient ? [
      {
        category: 'MAIN',
        items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }]
      },
      {
        category: 'TITLES',
        items: [
          { id: 'titles', label: 'My Titles', icon: 'book-open' },
          { id: 'submit-title', label: 'Submit New Title', icon: 'plus-circle' },
          { id: 'title-files', label: 'Title Files', icon: 'file-text' },
          { id: 'marketing-assets', label: 'Marketing Assets', icon: 'image' }
        ]
      },
      {
        category: 'BUSINESS',
        items: [
          { id: 'purchase-orders', label: 'Purchase Orders', icon: 'clipboard-list' },
          { id: 'sales', label: 'Sales', icon: 'trending-up' },
          { id: 'payments', label: 'Payments', icon: 'credit-card' }
        ]
      },
      {
        category: 'PRINTING',
        items: [
          { id: 'pod-projects', label: 'POD Printing', icon: 'printer' }
        ]
      },
      {
        category: 'ACCOUNT',
        items: [
          { id: 'profile', label: 'Company Profile', icon: 'user' },
          { id: 'resources', label: 'Resources', icon: 'library' },
          { id: 'support', label: 'Support', icon: 'help-circle' },
          { id: 'logout-nav', label: 'Logout', icon: 'log-out' }
        ]
      }
    ] : currentUser.role === 'retailer' ? [
      {
        category: 'MAIN',
        items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }]
      },
      {
        category: 'ORDERING',
        items: [
          { id: 'retailer-catalog', label: 'Order Books', icon: 'book-open' },
          { id: 'current-order', label: 'Current Order', icon: 'shopping-cart' }
        ]
      },
      {
        category: 'ORDERS',
        items: [
          { id: 'order-history', label: 'Past Orders', icon: 'file-text' },
          { id: 'shipments', label: 'Shipments', icon: 'truck' },
          { id: 'retailer-returns', label: 'Returns / Damages', icon: 'refresh-cw' }
        ]
      },
      {
        category: 'ACCOUNT',
        items: [
          { id: 'catalog-downloads', label: 'Downloads', icon: 'download' },
          { id: 'profile', label: 'Store Information', icon: 'user' },
          { id: 'logout-nav', label: 'Logout', icon: 'log-out' }
        ]
      }
    ] : currentUser.role === 'preflight' ? [
      { category: 'MAIN', items: [{ id: 'dashboard', label: 'Main', icon: 'layout-dashboard' }, { id: 'preflight-queue', label: 'Preflight Queue', icon: 'list-checks' }] },
      { category: 'PRODUCTION', items: [{ id: 'production-orders', label: 'Production Jobs', icon: 'printer' }, { id: 'file-review', label: 'File Review', icon: 'file-check' }, { id: 'approved-files', label: 'Approved Files', icon: 'badge-check' }] },
      { category: 'ACCOUNT', items: [{ id: 'my-activity', label: 'My Activity', icon: 'history' }, { id: 'account', label: 'Account', icon: 'user' }, { id: 'logout-nav', label: 'Logout', icon: 'log-out' }] }
    ] : currentUser.isPodClient ? [
      { category: 'MAIN', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }] },
      { category: 'PRINTING', items: [{ id: 'pod-projects', label: 'POD Orders', icon: 'printer' }] },
      { category: 'ACCOUNT', items: [{ id: 'profile', label: 'Company Profile', icon: 'user' }, { id: 'logout-nav', label: 'Logout', icon: 'log-out' }] }
    ] : [
      {
        category: 'MAIN',
        items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }]
      },
      {
        category: 'BUSINESS',
        items: [
          { id: 'catalog', label: 'Catalog', icon: 'book-open' },
          { id: 'cycles', label: 'Catalog Cycles', icon: 'calendar' },
          { id: 'publishers', label: 'Publishers', icon: 'users' },
          { id: 'retailers', label: 'Retailers', icon: 'shopping-cart' },
          { id: 'pod-accounts', label: 'POD Accounts', icon: 'printer' }
        ]
      },
      {
        category: 'OPERATIONS',
        items: [
          { id: 'orders', label: 'Orders', icon: 'file-text' },
          { id: 'purchase-orders', label: 'Purchase Orders', icon: 'clipboard-list' },
          { id: 'inventory', label: 'Inventory', icon: 'package' },
          { id: 'fulfillment', label: 'Fulfillment', icon: 'truck' },
          { id: 'returns', label: 'Returns', icon: 'refresh-cw' }
        ]
      },
      {
        category: 'INSIGHTS',
        items: [{ id: 'analytics', label: 'Analytics', icon: 'bar-chart-3' }]
      },
      {
        category: 'SYSTEM',
        items: [...(['moos','admin'].includes(currentUser.role) ? [{ id: 'moos-access', label: currentUser.role === 'moos' ? 'MO.OS Access' : 'Team Access', icon: 'shield-check' }] : []), { id: 'settings', label: 'Settings', icon: 'settings' }]
      }
    ];

    const authorizedNav = navStructure.map(category => ({ ...category, items: category.items.filter(item => item.id === 'logout-nav' || canAccessSection(currentUser, item.id)) })).filter(category => category.items.length);
    const sidebarContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-sidebar)', borderRight: 'var(--border-neutral)' }}>
        {/* Brand Header */}
        <div className="portal-sidebar-brand" onClick={() => setActiveSection('dashboard')}>
          <div className="portal-sidebar-brand-mark">
            <img
              className="portal-sidebar-logo"
              src={portalLogo}
              alt={portalLogoAlt}
            />
          </div>
        </div>

        {/* Navigation Categories */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {authorizedNav.map((cat, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.1em', paddingLeft: '12px', marginBottom: '4px' }}>
                {cat.category}
              </span>
              {cat.items.map(item => {
                const isActive = activeSection === item.id;
                const itemAccent = item.id.startsWith('pod-') ? 'var(--pod-green)' : portalAccent;
                const itemGlow = item.id.startsWith('pod-') ? 'var(--pod-green-glow)' : portalAccentGlow;
                const attentionCount = item.id === 'dashboard'
                  ? adminAttention.total
                  : (adminAttention.bySection[item.id] || 0);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'logout-nav') {
                        handleLogout();
                      } else {
                        setActiveSection(item.id);
                      }
                      setMobileMenuOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: isActive ? '600' : '500',
                      background: isActive ? itemGlow : 'transparent',
                      color: isActive ? itemAccent : 'var(--text-secondary)',
                      borderLeft: isActive ? `3px solid ${itemAccent}` : '3px solid transparent',
                      transition: 'var(--transition-fast)'
                    }}
                    className={`sidebar-nav-item${attentionCount ? ' has-attention' : ''}`}
                    aria-label={attentionCount ? `${item.label}, ${attentionCount} items need attention` : item.label}
                  >
                    <Icon name={item.icon} size={16} color={isActive ? itemAccent : 'var(--text-secondary)'} />
                    <span className="sidebar-nav-label">{item.label}</span>
                    {attentionCount > 0 && (
                      <span className={`sidebar-attention-badge${item.id.startsWith('pod-') ? ' pod-attention' : ''}`} title={`${attentionCount} unresolved item${attentionCount === 1 ? '' : 's'}`}>
                        <span className="sidebar-attention-dot" aria-hidden="true" />
                        <span>{attentionCount > 99 ? '99+' : attentionCount}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="portal-sidebar-home-link">
          <button type="button" className="btn btn-secondary" onClick={handleGoToHomepage}>
            <Icon name="home" size={15} />
            <span>Go to homepage</span>
          </button>
        </div>

        {/* Profile / Sign Out Bottom Block */}
        <div style={{ padding: '20px 15px', borderTop: 'var(--border-neutral)', background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {currentUser.companyName || currentUser.email}
            </div>
            <span className={`badge ${currentUser.isPodClient ? '' : 'badge-gold'}`} style={{ fontSize: '0.6rem', padding: '2px 8px', marginTop: '4px', color: portalAccent, border: `1px solid ${portalAccent}`, background: portalAccentGlow }}>
              {ROLE_LABELS[currentUser.role] || currentUser.role.toUpperCase()}
            </span>
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '6px', minWidth: '32px', height: '32px' }} 
            onClick={handleLogout}
            title="Sign Out"
          >
            <Icon name="log-out" size={14} />
          </button>
        </div>
      </div>
    );

    return (
      <div className={`portal-layout ${portalTheme}`} style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-deep)' }}>
        {/* Desktop Sidebar (Left column) */}
        <aside style={{ width: '230px', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 90, display: 'none' }} className="desktop-sidebar-visible">
          {sidebarContent}
        </aside>

        {/* Mobile Slide-out Drawer */}
        {mobileMenuOpen && (
          <div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} 
            onClick={() => setMobileMenuOpen(false)}
          >
            <div 
              style={{ width: '240px', height: '100%', animation: 'slideIn 0.2s ease-out' }} 
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent}
            </div>
          </div>
        )}

        {/* Main Content Area (Right column) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }} className="main-content-shifted">
          
          {/* Top Bar Header */}
          <header className="portal-topbar" style={{ height: '60px', background: 'var(--bg-deep)', borderBottom: 'var(--border-neutral)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 25px', position: 'sticky', top: 0, zIndex: 80 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', minWidth: 0 }}>
              {/* Mobile hamburger menu */}
              <button 
                className="btn btn-secondary mobile-menu-toggle" 
                style={{ padding: '6px', display: 'none' }} 
                onClick={() => setMobileMenuOpen(true)}
              >
                <Icon name="menu" size={18} />
              </button>
              <h2 style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0, letterSpacing: '0.01em', textTransform: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getSectionTitle()}
              </h2>
            </div>

            {/* Right Header Area */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} className="search-bar-top">
                <Icon name="search" size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} />
                <input 
                  type="text" 
                  placeholder="Search catalog, orders..."
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #26292d', borderRadius: '6px', padding: '6px 10px 6px 30px', fontSize: '0.8rem', color: '#fff', width: '200px' }}
                />
              </div>

              {/* Notification Bell */}
              <div style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Icon name="bell" size={16} color="var(--text-secondary)" />
                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '6px', height: '6px', background: 'var(--gold-primary)', borderRadius: '50%' }}></span>
              </div>

              {/* Company Info Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', background: 'var(--gold-glow)', border: '1px solid var(--gold-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                  {currentUser.companyName ? currentUser.companyName.charAt(0).toUpperCase() : 'P'}
                </div>
                {(currentUser.roles || [currentUser.role]).length > 1 && (
                  <select className="portal-role-switcher" value={currentUser.role} onChange={(e) => handleRoleSwitch(e.target.value)} aria-label="Switch account role">
                    {(currentUser.roles || [currentUser.role]).map(role => <option key={role} value={role}>{role === 'pod' ? 'POD Customer' : role.charAt(0).toUpperCase() + role.slice(1)}</option>)}
                  </select>
                )}
              </div>
            </div>
          </header>

          {/* Page Routing Container */}
          <main className="portal-main" style={{ flex: 1, padding: '30px', position: 'relative' }}>
            {(currentUser.role === 'admin' || currentUser.role === 'moos') && activeSection !== 'moos-access' && <AdminPortal user={currentUser} activeSection={activeSection} setActiveSection={setActiveSection} onAttentionChange={handlePrototypeAttentionChange} />}
            {(currentUser.role === 'admin' || currentUser.role === 'moos') && activeSection === 'moos-access' && <MoosAccess user={currentUser} />}
            {currentUser.role === 'preflight' && <PreflightPortal user={currentUser} activeSection={activeSection} />}
            {currentUser.role === 'publisher' && !currentUser.isPodClient && <PublisherPortal user={currentUser} onSessionUpdate={handleSessionUpdate} activeSection={activeSection} setActiveSection={setActiveSection} />}
            {currentUser.role === 'retailer' && (
              <RetailerPortal user={currentUser} onSessionUpdate={handleSessionUpdate} activeSection={activeSection} setActiveSection={setActiveSection} />
            )}
            {currentUser.role === 'publisher' && currentUser.isPodClient && <PodPortal user={currentUser} activeSection={activeSection} setActiveSection={setActiveSection} />}
          </main>
        </div>

        {/* App CSS for responsive layout */}
        <style>{`
          @media (min-width: 769px) {
            .desktop-sidebar-visible { display: block !important; }
            .main-content-shifted { margin-left: 230px !important; }
          }
          @media (max-width: 768px) {
            .mobile-menu-toggle { display: inline-flex !important; }
            .search-bar-top { display: none !important; }
            .portal-topbar { padding: 0 14px !important; gap: 12px; }
          }
          @keyframes slideIn {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    );
  };

  // For anonymous landing pages (home, services, apply, login)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {currentPage !== 'portal' && currentPage !== 'staff-login' && currentPage !== 'demo-access' && (
        <header className="public-header">
          <div 
            className="public-brand"
            onClick={navigateHome}
            role="link"
            tabIndex="0"
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigateHome(); }}
          >
            <img src={assetPath('brand/philbo-logo.png')} alt="Philbo Distribution" />
          </div>

          <nav className="public-nav">
            <span 
              style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'home' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}
              onClick={navigateHome}
            >
              Home
            </span>
            <a
              href={`${CATALOG_PATH}${window.location.search}${demoEnvironment ? '#home' : ''}`}
              style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'public-catalog' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}
              onClick={(event) => { event.preventDefault(); navigateCatalog(); }}
            >
              Catalog
            </a>
            <span 
              style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'publishers' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}
              onClick={() => setCurrentPage('publishers')}
            >
              Publishers
            </span>
            <span style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'retailers' ? 'var(--gold-primary)' : 'var(--text-secondary)' }} onClick={() => setCurrentPage('retailers')}>Retailers</span>
            <span style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'services' ? 'var(--pod-green)' : 'var(--text-secondary)' }} onClick={() => setCurrentPage('services')}>Print on Demand</span>
            <span style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage.startsWith('apply') ? 'var(--gold-primary)' : 'var(--text-secondary)' }} onClick={() => setCurrentPage('apply')}>Apply</span>
            {demoEnvironment && (
              <button
                type="button"
                className={`btn btn-primary public-demo-access-btn${currentPage === 'demo-access' ? ' is-active' : ''}`}
                onClick={()=>{ window.location.hash='demo'; setCurrentPage('demo-access'); }}
              >
                ★ Demo Access
              </button>
            )}

            {currentUser ? (
              <>
                <span 
                  style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', color: currentPage === 'portal' ? 'var(--gold-primary)' : 'var(--text-secondary)' }}
                  onClick={() => setCurrentPage('portal')}
                >
                  My Portal
                </span>
                <div style={{ width: '1px', height: '16px', background: 'var(--border-glow)' }}></div>
                <button className="btn btn-secondary public-signout-btn" type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
                  <Icon name="log-out" size={14} />
                  <span className="public-signout-label">Sign Out</span>
                </button>
              </>
            ) : (
              demoEnvironment && !isProductionBackendEnabled ? (
                <button type="button" className="btn public-signin-disabled" disabled title="Use Demo Access for beta testing">
                  Sign In
                </button>
              ) : (
                <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={() => setCurrentPage('login')}>
                  Sign In
                </button>
              )
            )}
          </nav>
        </header>
      )}

      {/* Main Pages Container */}
      <main style={{ flex: 1, position: 'relative' }}>
        {currentPage === 'home' && <Home onNavigate={setCurrentPage} />}
        {currentPage === 'public-catalog' && <PublicCatalog onNavigate={setCurrentPage} currentUser={currentUser} onSessionUpdate={handleSessionUpdate} />}
        {currentPage === 'retailers' && <AudiencePage type="retailer" onNavigate={setCurrentPage} />}
        {currentPage === 'publishers' && <AudiencePage type="publisher" onNavigate={setCurrentPage} />}
        {currentPage === 'services' && <Services onNavigate={setCurrentPage} />}
        {currentPage === 'apply' && <Apply onNavigate={setCurrentPage} initialRole="retailer" />}
        {currentPage === 'apply-retailer' && <Apply onNavigate={setCurrentPage} initialRole="retailer" />}
        {currentPage === 'apply-publisher' && <Apply onNavigate={setCurrentPage} initialRole="publisher" />}
        {currentPage === 'apply-pod' && <Apply onNavigate={setCurrentPage} initialRole="pod" />}
        {currentPage === 'guide' && <PublisherGuide onNavigate={setCurrentPage} />}
        {currentPage === 'privacy' && <PrivacyPolicy />}
        {currentPage === 'terms' && <TermsOfService />}
        {currentPage === 'login' && (
          <Login onLoginSuccess={handleLoginSuccess} onNavigate={setCurrentPage} />
        )}
        {currentPage === 'staff-login' && (
          <Login staffOnly onLoginSuccess={handleLoginSuccess} onNavigate={setCurrentPage} />
        )}
        {currentPage === 'password-setup' && (
          <Login onLoginSuccess={handleLoginSuccess} onNavigate={setCurrentPage} />
        )}
        {currentPage === 'demo-access' && (
          <DemoAccess onLoginSuccess={handleLoginSuccess} onNavigateHome={navigateHome} />
        )}
        {currentPage === 'portal' && currentUser && renderPortalLayout()}
      </main>

      {/* Footer for anonymous landing pages */}
      {currentPage !== 'portal' && currentPage !== 'staff-login' && currentPage !== 'demo-access' && (
        <footer className="public-footer">
          <p>
            © 2026 Philbo Entertainment Promotions Inc. All rights reserved. Third-party trademarks and content remain the property of their respective owners.
          </p>
          <p className="site-credit">
            Built &amp; Powered by MO.io™ · A Powers Creative Solutions System
          </p>
          <nav aria-label="Legal information">
            <a href="/privacy" onClick={(event) => { event.preventDefault(); navigateLegal('privacy'); }}>Privacy Policy</a>
            <a href="/terms" onClick={(event) => { event.preventDefault(); navigateLegal('terms'); }}>Terms of Service</a>
          </nav>
        </footer>
      )}


    </div>
  );
}

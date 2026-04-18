import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export function Account() {
  const { user, loaded, load } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    if (loaded && !user) navigate('/login?redirect=/account');
  }, [loaded, user, navigate]);

  if (!user) return null;

  return (
    <div className="container" style={{ padding: '2rem 0', maxWidth: 720 }}>
      <h1>Account</h1>
      <div className="admin-card">
        <div><strong>Email:</strong> {user.email}</div>
        <div><strong>Name:</strong> {user.firstName ?? ''} {user.lastName ?? ''}</div>
        <div><strong>Role:</strong> {user.role}</div>
      </div>
      <Link to="/account/orders" className="btn">View orders</Link>
    </div>
  );
}

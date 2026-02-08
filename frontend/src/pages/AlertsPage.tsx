/**
 * AlertsPage - View price changes and new listing alerts
 */

import { Loader2, Bell, TrendingDown, TrendingUp, Home, CheckCircle } from 'lucide-react';
import { useAlerts, useMarkAlertRead } from '../api';
import type { Alert } from '../types';

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface AlertCardProps {
  alert: Alert;
  onMarkRead: () => void;
}

function AlertCard({ alert, onMarkRead }: AlertCardProps) {
  const isUnread = !alert.read_at;

  const getAlertIcon = () => {
    switch (alert.alert_type) {
      case 'price_drop':
        return <TrendingDown className="w-5 h-5 text-green-500" />;
      case 'price_increase':
        return <TrendingUp className="w-5 h-5 text-red-500" />;
      case 'new_listing':
        return <Home className="w-5 h-5 text-blue-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertMessage = () => {
    switch (alert.alert_type) {
      case 'price_drop':
        return (
          <span>
            Price dropped from{' '}
            <span className="line-through text-gray-500">
              {formatPrice(alert.old_price!)}
            </span>{' '}
            to{' '}
            <span className="text-green-600 font-medium">
              {formatPrice(alert.new_price!)}
            </span>
          </span>
        );
      case 'price_increase':
        return (
          <span>
            Price increased from{' '}
            <span className="line-through text-gray-500">
              {formatPrice(alert.old_price!)}
            </span>{' '}
            to{' '}
            <span className="text-red-600 font-medium">
              {formatPrice(alert.new_price!)}
            </span>
          </span>
        );
      case 'new_listing':
        return (
          <span>
            New listing at{' '}
            <span className="font-medium">{formatPrice(alert.price)}</span>
          </span>
        );
      default:
        return 'Alert';
    }
  };

  return (
    <div
      className={`flex gap-3 p-4 bg-white rounded-xl shadow-sm ${
        isUnread ? 'border-l-4 border-blue-500' : ''
      }`}
      onClick={isUnread ? onMarkRead : undefined}
    >
      {/* Image */}
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
        {alert.image_url ? (
          <img
            src={alert.image_url}
            alt={alert.street}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <Home className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {getAlertIcon()}
          <span className="text-xs text-gray-500">
            {formatTimeAgo(alert.created_at)}
          </span>
          {isUnread && (
            <span className="w-2 h-2 bg-blue-500 rounded-full ml-auto" />
          )}
        </div>
        <h3 className="font-medium text-gray-900 truncate mt-1">
          {alert.street}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{getAlertMessage()}</p>
      </div>
    </div>
  );
}

export function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts();
  const markReadMutation = useMarkAlertRead();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <Bell className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium">No alerts yet</p>
        <p className="text-sm mt-1 text-center">
          You'll get notified when your favorites have price changes
        </p>
      </div>
    );
  }

  const unreadCount = alerts.filter((a) => !a.read_at).length;

  return (
    <div className="h-full overflow-auto bg-gray-100">
      <header className="bg-white shadow-sm px-4 py-3 sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Alerts {unreadCount > 0 && `(${unreadCount})`}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={() => {
              alerts
                .filter((a) => !a.read_at)
                .forEach((a) => markReadMutation.mutate(a.id));
            }}
            className="text-sm text-blue-600 flex items-center gap-1"
          >
            <CheckCircle className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </header>

      <div className="p-4 space-y-3">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onMarkRead={() => markReadMutation.mutate(alert.id)}
          />
        ))}
      </div>
    </div>
  );
}

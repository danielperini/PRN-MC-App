import { toast } from 'sonner';

export function useNotification() {
  const success = (title, description = '') => {
    toast.success(title, { description, duration: 3000 });
  };

  const error = (title, description = '') => {
    toast.error(title, { description, duration: 4000 });
  };

  const info = (title, description = '') => {
    toast(title, { description, duration: 3000 });
  };

  const warning = (title, description = '') => {
    toast.warning(title, { description, duration: 3500 });
  };

  return { success, error, info, warning };
}
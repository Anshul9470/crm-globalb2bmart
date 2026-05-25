import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle key={`title-${id}`}>{title}</ToastTitle>}
              {description && <ToastDescription key={`description-${id}`}>{description}</ToastDescription>}
            </div>
            {action && <div key={`action-${id}`}>{action}</div>}
            <ToastClose key={`close-${id}`} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

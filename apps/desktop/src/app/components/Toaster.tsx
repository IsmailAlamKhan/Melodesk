import { AnimatePresence, motion } from 'framer-motion';
import { useToasts } from '../toast';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="type-body-medium rounded-md bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-lg"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

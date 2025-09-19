import { useInstance } from '@src/providers/app';
import { useEffect, useState } from 'react';

export function useMessages() {
  const { instance } = useInstance();
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!instance) return;
    // TODO: Implement messages loading
  }, [instance]);

  return { messages };
}
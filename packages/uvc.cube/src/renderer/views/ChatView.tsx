import { MessageScroller } from '@shadcn/react/message-scroller';
import { Bot, Camera, Circle, MessageSquare, Search, Send, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { DiscoveryDeviceSnapshot } from '@shared/contracts';

interface ChatConversation {
  id: string;
  title: string;
  subtitle: string;
  kind: 'agent' | 'device' | 'operator';
  online?: boolean;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  author: 'operator' | 'assistant' | 'device';
  body: string;
  timestamp: string;
}

interface ChatViewProps {
  devices: DiscoveryDeviceSnapshot[];
  workspacePackageCount: number;
}

function formatDeviceTitle(device: DiscoveryDeviceSnapshot): string {
  if (device.name?.trim()) {
    return device.name;
  }

  return device.mdnsName || device.address || device.id;
}

function formatDeviceSubtitle(device: DiscoveryDeviceSnapshot): string {
  const endpoint = [device.address, device.port].filter(Boolean).join(':');
  return endpoint || device.type || device.role || 'Discovery device';
}

function formatTime(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createConversations(devices: DiscoveryDeviceSnapshot[]): ChatConversation[] {
  const deviceConversations = devices.slice(0, 8).map((device) => ({
    id: `device:${device.id}`,
    title: formatDeviceTitle(device),
    subtitle: formatDeviceSubtitle(device),
    kind: 'device' as const,
    online: device.online,
  }));

  return [
    {
      id: 'agent:operations',
      title: 'Operations Copilot',
      subtitle: 'Workspace and camera workflow assistant',
      kind: 'agent',
      online: true,
    },
    {
      id: 'operator:handoff',
      title: 'Operator Handoff',
      subtitle: 'Notes for the next monitoring shift',
      kind: 'operator',
      online: true,
    },
    ...deviceConversations,
  ];
}

function initialMessages(workspacePackageCount: number): ChatMessage[] {
  return [
    {
      id: 'welcome-ops',
      conversationId: 'agent:operations',
      author: 'assistant',
      body: `UVC Cube is watching ${workspacePackageCount} workspace packages. Ask me to inspect discovery, camera feeds, or settings drift.`,
      timestamp: formatTime(),
    },
    {
      id: 'welcome-handoff',
      conversationId: 'operator:handoff',
      author: 'operator',
      body: 'Shift notes will live here once the desktop shell is wired to the persistent chat backend.',
      timestamp: formatTime(),
    },
  ];
}

function ConversationIcon({ conversation }: { conversation: ChatConversation }) {
  if (conversation.kind === 'agent') {
    return <Bot aria-hidden="true" />;
  }

  if (conversation.kind === 'device') {
    return <Camera aria-hidden="true" />;
  }

  return <UserRound aria-hidden="true" />;
}

function MessageIcon({ author }: { author: ChatMessage['author'] }) {
  if (author === 'operator') {
    return <UserRound aria-hidden="true" />;
  }

  if (author === 'device') {
    return <Camera aria-hidden="true" />;
  }

  return <Bot aria-hidden="true" />;
}

export function ChatView({ devices, workspacePackageCount }: ChatViewProps) {
  const conversations = useMemo(() => createConversations(devices), [devices]);
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? 'agent:operations');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages(workspacePackageCount));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages((current) => current.map((message) => {
      if (message.id !== 'welcome-ops') {
        return message;
      }

      return {
        ...message,
        body: `UVC Cube is watching ${workspacePackageCount} workspace packages. Ask me to inspect discovery, camera feeds, or settings drift.`,
      };
    }));
  }, [workspacePackageCount]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((conversation) => {
      return `${conversation.title} ${conversation.subtitle}`.toLowerCase().includes(normalizedQuery);
    })
    : conversations;
  const visibleMessages = messages.filter((message) => message.conversationId === selectedConversation?.id);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = draft.trim();
    if (!body || !selectedConversation) {
      return;
    }

    const timestamp = formatTime();
    setMessages((current) => [
      ...current,
      {
        id: `operator-${Date.now()}`,
        conversationId: selectedConversation.id,
        author: 'operator',
        body,
        timestamp,
      },
      {
        id: `assistant-${Date.now()}`,
        conversationId: selectedConversation.id,
        author: selectedConversation.kind === 'device' ? 'device' : 'assistant',
        body: selectedConversation.kind === 'device'
          ? 'Device chat is ready at the UI layer. The next step is connecting this conversation to the device command and telemetry IPC.'
          : 'Chat UI is routed and ready. Connect this composer to the ONE chat model when the desktop backend exposes the send endpoint.',
        timestamp,
      },
    ]);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <section className="chat-shell" aria-label="Chat workspace">
      <div className="chat-sidebar">
        <div className="chat-header">
          <span className="eyebrow">Shadcn Chat</span>
          <h2>Conversations</h2>
          <p>Operator, assistant, and discovered device threads in one routed workspace.</p>
        </div>

        <label className="chat-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            value={query}
          />
        </label>

        <div className="conversation-list" role="list">
          {filteredConversations.map((conversation) => (
            <button
              className={conversation.id === selectedConversation?.id ? 'conversation-item conversation-item--active' : 'conversation-item'}
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              type="button"
            >
              <span className="conversation-avatar">
                <ConversationIcon conversation={conversation} />
              </span>
              <span className="conversation-copy">
                <strong>{conversation.title}</strong>
                <span>{conversation.subtitle}</span>
              </span>
              {conversation.online !== undefined ? (
                <span className={conversation.online ? 'presence presence--online' : 'presence'}>
                  <Circle aria-hidden="true" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-panel">
        {selectedConversation ? (
          <>
            <div className="chat-panel__topbar">
              <span className="conversation-avatar conversation-avatar--large">
                <ConversationIcon conversation={selectedConversation} />
              </span>
              <div>
                <h2>{selectedConversation.title}</h2>
                <p>{selectedConversation.subtitle}</p>
              </div>
            </div>

            <MessageScroller.Provider autoScroll defaultScrollPosition="end">
              <MessageScroller.Root className="message-scroller">
                <MessageScroller.Viewport aria-label={`${selectedConversation.title} messages`} className="message-list">
                  <MessageScroller.Content className="message-list__content">
                    {visibleMessages.length === 0 ? (
                      <div className="empty-chat">
                        <MessageSquare aria-hidden="true" />
                        <strong>No messages yet</strong>
                        <span>Start the thread from the composer below.</span>
                      </div>
                    ) : (
                      visibleMessages.map((message) => (
                        <MessageScroller.Item
                          className={message.author === 'operator' ? 'message-bubble message-bubble--own' : 'message-bubble'}
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor
                        >
                          <span className="message-avatar">
                            <MessageIcon author={message.author} />
                          </span>
                          <div className="message-card">
                            <div className="message-card__meta">
                              <strong>{message.author === 'operator' ? 'You' : selectedConversation.title}</strong>
                              <time>{message.timestamp}</time>
                            </div>
                            <p>{message.body}</p>
                          </div>
                        </MessageScroller.Item>
                      ))
                    )}
                  </MessageScroller.Content>
                </MessageScroller.Viewport>
              </MessageScroller.Root>
            </MessageScroller.Provider>

            <form className="chat-composer" onSubmit={handleSubmit}>
              <input
                aria-label={`Message ${selectedConversation.title}`}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a message"
                ref={inputRef}
                value={draft}
              />
              <button aria-label="Send message" disabled={!draft.trim()} type="submit">
                <Send aria-hidden="true" />
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat empty-chat--panel">
            <MessageSquare aria-hidden="true" />
            <strong>Select a conversation</strong>
          </div>
        )}
      </div>
    </section>
  );
}

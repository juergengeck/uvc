import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {Colors} from '../constants/Colors';
import type {LaneApiClient} from './portIpc';
import {emptyChatUnread, markChatRead, receiveChatNotification} from './chatState';

/** `commands` makes the chat a fixed command channel (lamp and sensor). */
type Peer = {person: string; name: string; commands?: readonly string[]};
type Message = {id?: string; text: string; sender: string; sentAt: number};
type ChatEvent = {kind?: string; peer?: string; message?: {id?: string; incoming?: boolean}};
type Palette = typeof Colors.light | typeof Colors.dark;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Each worker owns its contact chats and unread state, including while settings is open. */
export function LaneChat({client, me, peers, dark, enabled, hidden}: {
  client?: LaneApiClient; me: string; peers: Peer[]; dark: boolean; enabled: boolean; hidden: boolean;
}) {
  const c = Colors[dark ? 'dark' : 'light'];
  const [active, setActive] = useState<string | null>(null);
  const [unread, setUnread] = useState(emptyChatUnread);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const visiblePeer = useRef<string | null>(null);
  visiblePeer.current = hidden ? null : active;
  const peerKey = peers.map(peer => peer.person).sort().join(',');

  useEffect(() => {
    setUnread(emptyChatUnread());
    setActive(null);
    return client?.onControl(value => {
      const event = value as ChatEvent;
      if (event.kind !== 'chat-updated' || !event.peer || !event.message?.id) return;
      setUnread(state => receiveChatNotification(state, event.peer!, event.message!.id!, event.message?.incoming === true, visiblePeer.current));
    });
  }, [client]);

  useEffect(() => {
    if (!hidden && active) setUnread(state => markChatRead(state, active));
  }, [hidden, active]);

  useEffect(() => {
    if (!client || !enabled) return;
    let cancelled = false;
    // Register every known contact before their first message, just as Amway does.
    void Promise.all(peerKey.split(',').filter(Boolean).map(async peer => {
      try {
        await client.call('chat', 'openChat', {peer});
        if (!cancelled) setErrors(previous => {const next = {...previous}; delete next[peer]; return next;});
      } catch (error) {
        if (!cancelled) setErrors(previous => ({...previous, [peer]: errorText(error)}));
      }
    }));
    return () => {cancelled = true;};
  }, [client, enabled, peerKey]);

  const open = (peer: string) => {
    const next = active === peer ? null : peer;
    visiblePeer.current = next;
    setActive(next);
    if (next) setUnread(state => markChatRead(state, next));
  };
  return <View style={[styles.contacts, hidden && {display: 'none'}]}>
    <Text style={[styles.heading, {color: c.text}]}>Contacts</Text>
    {!peers.length && <Text style={{color: c.textSecondary}}>Contacts appear when peers connect.</Text>}
    {peers.map(peer => <View key={peer.person} style={styles.contact}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open chat with ${peer.name}`} disabled={!enabled} onPress={() => open(peer.person)} style={[styles.contactRow, {borderColor: c.border, opacity: enabled ? 1 : 0.5}]}>
        <View style={styles.grow}>
          <Text style={[styles.name, {color: c.text}]}>{peer.name}</Text>
          <Text style={[styles.small, {color: c.textSecondary}]}>{peer.person.slice(0, 8)}…{peer.person.slice(-4)}</Text>
        </View>
        <Text aria-hidden style={{fontSize: 20}}>💬</Text>
        {!!unread.counts[peer.person] && <View accessibilityLabel={`${unread.counts[peer.person]} unread from ${peer.name}`} style={[styles.badge, {backgroundColor: c.primary}]}><Text style={{color: c.background, fontWeight: '700'}}>{unread.counts[peer.person] > 9 ? '9+' : unread.counts[peer.person]}</Text></View>}
      </Pressable>
      {errors[peer.person] && <Text accessibilityRole="alert" style={{color: c.error}}>{errors[peer.person]}</Text>}
      {active === peer.person && <ChatPanel key={peer.person} client={client} me={me} peer={peer} c={c} enabled={enabled && !hidden} onClose={() => {visiblePeer.current = null; setActive(null);}} />}
    </View>)}
  </View>;
}

function ChatPanel({client, me, peer, c, enabled, onClose}: {client?: LaneApiClient; me: string; peer: Peer; c: Palette; enabled: boolean; onClose: () => void}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const sendBusy = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {});
  const thread = useRef<ScrollView>(null);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let reading = false;
    let dirty = false;
    const read = async () => {
      if (!client || cancelled) return;
      if (reading) {dirty = true; return;}
      reading = true;
      try {
        do {
          dirty = false;
          const result = await client.call<{messages: Message[]}>('chat', 'readChat', {peer: peer.person, count: 200});
          if (!cancelled) {setMessages(result.messages); setError(''); setLoading(false);}
        } while (dirty && !cancelled);
      } catch (cause) {
        if (!cancelled) {setError(errorText(cause)); setLoading(false);}
      } finally {reading = false;}
    };
    refresh.current = read;
    const stop = client?.onControl(value => {
      const event = value as ChatEvent;
      if (event.kind === 'chat-updated' && event.peer === peer.person) void read();
    });
    void read();
    return () => {cancelled = true; alive.current = false; stop?.();};
  }, [client, peer.person]);
  const send = async (value: string) => {
    const text = value.trim();
    if (!client || !enabled || !text || sendBusy.current) return;
    sendBusy.current = true;
    setSending(true);
    setError('');
    try {
      await client.call('chat', 'sendChat', {peer: peer.person, text});
      if (alive.current) {setDraft(''); await refresh.current();}
    } catch (cause) {
      if (alive.current) setError(errorText(cause));
    } finally {
      sendBusy.current = false;
      if (alive.current) setSending(false);
    }
  };
  return <View accessibilityLabel={`Chat with ${peer.name}`} style={[styles.panel, {borderColor: c.border}]}>
    <View style={styles.panelHeader}>
      <Text style={[styles.name, styles.grow, {color: c.text}]}>Chat with {peer.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose} style={styles.close}><Text style={{color: c.text, fontSize: 22}}>×</Text></Pressable>
    </View>
    {loading && <ActivityIndicator color={c.primary} accessibilityLabel="Opening chat" />}
    {!!error && <Text accessibilityRole="alert" style={{color: c.error}}>{error}</Text>}
    <ScrollView ref={thread} nestedScrollEnabled style={styles.thread} contentContainerStyle={styles.threadContent} onContentSizeChange={() => thread.current?.scrollToEnd({animated: false})}>
      {!loading && !messages.length && <Text style={{color: c.textSecondary}}>No messages yet.</Text>}
      {messages.map((row, index) => <View key={row.id ?? `${row.sender}:${row.sentAt}:${index}`} style={[styles.bubble, {alignSelf: row.sender === me ? 'flex-end' : 'flex-start', backgroundColor: row.sender === me ? c.background : c.surface, borderColor: row.sender === me ? c.primary : c.border}]}>
        <Text selectable style={{color: c.text}}>{row.text}</Text>
        <Text style={[styles.small, {color: c.textSecondary}]}>{row.sender === me ? 'You' : peer.name} · {new Date(row.sentAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</Text>
      </View>)}
    </ScrollView>
    {peer.commands ? <View style={styles.commands}>
      {peer.commands.map(command => <Pressable key={command} accessibilityRole="button" accessibilityLabel={`Send ${command} to ${peer.name}`} disabled={!enabled || sending} onPress={() => {void send(command);}} style={[styles.command, {backgroundColor: c.primary, opacity: enabled && !sending ? 1 : 0.45}]}>
        <Text style={{color: c.background, fontWeight: '600'}}>{command[0].toUpperCase() + command.slice(1)}</Text>
      </Pressable>)}
    </View> : <>
      <TextInput accessibilityLabel={`Message ${peer.name}`} placeholder={`Message ${peer.name}`} placeholderTextColor={c.textSecondary} value={draft} onChangeText={setDraft} maxLength={2000} editable={enabled && !sending} onSubmitEditing={() => {void send(draft);}} style={[styles.input, {borderColor: c.border, color: c.text, backgroundColor: c.background}]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!enabled || sending || !draft.trim()} onPress={() => {void send(draft);}} style={[styles.send, {backgroundColor: c.primary, opacity: enabled && !sending && draft.trim() ? 1 : 0.45}]}>
        <Text style={{color: c.background, fontWeight: '600'}}>{sending ? 'Sending…' : 'Send'}</Text>
      </Pressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  contacts: {gap: 10}, heading: {fontSize: 17, fontWeight: '600'}, contact: {gap: 8},
  contactRow: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 56},
  grow: {flex: 1, minWidth: 0}, name: {fontSize: 14, fontWeight: '600'}, small: {fontSize: 11, marginTop: 4},
  badge: {minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center'},
  panel: {borderWidth: 1, borderRadius: 8, padding: 10, gap: 10}, panelHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  close: {minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center'},
  thread: {maxHeight: 240}, threadContent: {gap: 8}, bubble: {maxWidth: '92%', borderWidth: 1, borderRadius: 8, padding: 9, gap: 3},
  input: {borderWidth: 1, borderRadius: 6, padding: 10, minHeight: 44, fontSize: 14},
  send: {alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 6},
  commands: {flexDirection: 'row', gap: 8}, command: {flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 6},
});

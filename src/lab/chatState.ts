/** Unread counts follow channel-entry identity, not message text or feed count. */
export interface ChatUnreadState {
  seen: Record<string, true>;
  counts: Record<string, number>;
}
export const emptyChatUnread = (): ChatUnreadState => ({seen: {}, counts: {}});
export function receiveChatNotification(state: ChatUnreadState, peer: string, id: string, incoming: boolean, visiblePeer: string | null): ChatUnreadState {
  const key = `${peer}:${id}`;
  if (state.seen[key]) return state;
  return {
    seen: {...state.seen, [key]: true},
    counts: incoming && visiblePeer !== peer ? {...state.counts, [peer]: (state.counts[peer] ?? 0) + 1} : state.counts,
  };
}
export function markChatRead(state: ChatUnreadState, peer: string): ChatUnreadState {
  const counts = {...state.counts};
  delete counts[peer];
  return {...state, counts};
}

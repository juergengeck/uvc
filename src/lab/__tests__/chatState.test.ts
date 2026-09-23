import {emptyChatUnread, markChatRead, receiveChatNotification} from '../chatState';

describe('contact chat unread state', () => {
  it('counts distinct entries once and preserves replay identity after opening', () => {
    let state = receiveChatNotification(emptyChatUnread(), 'doctor', 'entry-1', true, null);
    state = receiveChatNotification(state, 'doctor', 'entry-2', true, null);
    expect(state.counts.doctor).toBe(2);
    expect(receiveChatNotification(state, 'doctor', 'entry-1', true, null)).toBe(state);
    state = markChatRead(state, 'doctor');
    expect(state.counts.doctor).toBeUndefined();
    expect(receiveChatNotification(state, 'doctor', 'entry-1', true, null)).toBe(state);
    expect(receiveChatNotification(state, 'doctor', 'entry-3', true, null).counts.doctor).toBe(1);
  });
  it('ignores own messages and messages in the visible conversation', () => {
    let state = receiveChatNotification(emptyChatUnread(), 'doctor', 'own', false, null);
    state = receiveChatNotification(state, 'doctor', 'visible', true, 'doctor');
    expect(state.counts).toEqual({});
    state = receiveChatNotification(state, 'lamp', 'other-peer', true, 'doctor');
    expect(state.counts).toEqual({lamp: 1});
  });
});

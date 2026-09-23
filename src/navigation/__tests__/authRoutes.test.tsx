import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import TabsLayout from '../../../app/(tabs)/_layout';
import AuthLayout from '../../../app/(auth)/_layout';

let mockAuthState = 'logged_out';
const mockAuthenticator = {authState: {get currentState() {return mockAuthState;}}};
jest.mock('../../initialization', () => ({getAuthenticator: () => mockAuthenticator}));
jest.mock('expo-router', () => {
  const React = require('react');
  const Tabs = ({children}: any) => {
    if (mockAuthState !== 'logged_in') throw new Error('Protected screen mounted before login');
    return React.createElement('Tabs', null, children);
  };
  Tabs.Screen = () => null;
  return {Tabs, Stack: 'Stack', Redirect: 'Redirect', useRouter: () => ({push: jest.fn()})};
});
jest.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
jest.mock('react-native-paper', () => ({useTheme: () => ({colors: {}}), IconButton: 'IconButton'}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, bottom: 0})}));
jest.mock('../../components/brand/UvcLogo', () => ({UvcLogo: 'UvcLogo'}));
jest.mock('../../providers/app/AppTheme', () => ({useTheme: () => ({theme: {colors: {}}})}));
jest.mock('../../providers/app/AuthProvider', () => ({AuthProvider: 'AuthProvider'}));

let tree: ReactTestRenderer;
afterEach(() => {if (tree) act(() => tree.unmount());});
it('redirects a signed-out direct tab visit before any protected screen mounts', () => {
  mockAuthState = 'logged_out';
  act(() => {tree = create(<TabsLayout />);});
  expect(tree.root.findByType('Redirect' as any).props.href).toBe('/(auth)/login');
});
it('mounts the tabs after login', () => {
  mockAuthState = 'logged_in';
  act(() => {tree = create(<TabsLayout />);});
  expect(tree.root.findAllByType('Tabs' as any)).toHaveLength(1);
});
it('shows login while signed out and returns to Journal when login completes', () => {
  mockAuthState = 'logged_out';
  act(() => {tree = create(<AuthLayout />);});
  expect(tree.root.findAllByType('Stack' as any)).toHaveLength(1);
  mockAuthState = 'logged_in';
  act(() => tree.update(<AuthLayout />));
  expect(tree.root.findByType('Redirect' as any).props.href).toBe('/(tabs)/journal');
});

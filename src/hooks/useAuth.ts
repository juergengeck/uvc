import {useState, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    token: string | null;
    user: {
        id: string;
        email: string;
        name: string;
    } | null;
}

export function useAuth() {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        isLoading: true,
        token: null,
        user: null,
    });

    useEffect(() => {
        async function checkAuth() {
            try {
                const token = await AsyncStorage.getItem('auth_token');
                const userStr = await AsyncStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : null;

                setState({
                    isAuthenticated: !!token && !!user,
                    isLoading: false,
                    token,
                    user,
                });
            } catch (error) {
                console.error('Error checking auth state:', error);
                setState(prev => ({...prev, isLoading: false}));
            }
        }

        checkAuth();
    }, []);

    const login = async (token: string, user: AuthState['user']) => {
        try {
            await AsyncStorage.setItem('auth_token', token);
            await AsyncStorage.setItem('user', JSON.stringify(user));
            setState({
                isAuthenticated: true,
                isLoading: false,
                token,
                user,
            });
        } catch (error) {
            console.error('Error saving auth state:', error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await AsyncStorage.removeItem('auth_token');
            await AsyncStorage.removeItem('user');
            setState({
                isAuthenticated: false,
                isLoading: false,
                token: null,
                user: null,
            });
        } catch (error) {
            console.error('Error clearing auth state:', error);
            throw error;
        }
    };

    return {
        ...state,
        login,
        logout,
    };
} 
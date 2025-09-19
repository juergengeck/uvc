import {useCallback, useEffect} from 'react';

/**
 * Hook to handle swipe right for back navigation
 * @param onBack - Callback function to execute when swipe right is detected
 */
export function useSwipeBack(onBack: () => void) {
    const handleTouchStart = useCallback((e: TouchEvent) => {
        const touch = e.touches[0];
        const startX = touch.clientX;
        const startY = touch.clientY;

        const handleTouchMove = (e: TouchEvent) => {
            if (!e.touches[0]) return;

            const deltaX = e.touches[0].clientX - startX;
            const deltaY = e.touches[0].clientY - startY;

            // Only trigger if horizontal swipe is more significant than vertical
            if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 100) {
                onBack();
                cleanup();
            }
        };

        const handleTouchEnd = () => {
            cleanup();
        };

        const cleanup = () => {
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };

        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);
    }, [onBack]);

    useEffect(() => {
        document.addEventListener('touchstart', handleTouchStart);
        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
        };
    }, [handleTouchStart]);
}

export default useSwipeBack; 
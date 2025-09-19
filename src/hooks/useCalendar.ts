import { useState } from 'react';
import { MarkedDates } from 'react-native-calendars/src/types';

// Calendar event type definition
export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    color?: string;
    groupId?: string;
}

const CALENDAR_GROUP = 'calendar-events';

export function useCalendar() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [markedDates, setMarkedDates] = useState<MarkedDates>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // TODO: Implement calendar functionality with LeuteModel
    // For now, this is just a placeholder that manages events in local state

    const createEvent = async (event: Omit<CalendarEvent, 'id'>) => {
        try {
            setLoading(true);
            const newEvent: CalendarEvent = {
                id: Math.random().toString(36).substring(7),
                ...event,
                groupId: CALENDAR_GROUP
            };

            setEvents(prev => [...prev, newEvent]);

            // Update marked dates
            setMarkedDates(prev => ({
                ...prev,
                [newEvent.startDate.split('T')[0]]: {
                    marked: true,
                    dotColor: newEvent.color || '#50cebb'
                }
            }));

            return newEvent;
        } catch (err: any) {
            console.error('[useCalendar] Failed to create event:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const deleteEvent = async (eventId: string) => {
        try {
            setLoading(true);
            setEvents(prev => prev.filter(e => e.id !== eventId));

            // Update marked dates
            setMarkedDates(prev => {
                const newMarked = { ...prev };
                const event = events.find(e => e.id === eventId);
                if (event) {
                    delete newMarked[event.startDate.split('T')[0]];
                }
                return newMarked;
            });
        } catch (err: any) {
            console.error('[useCalendar] Failed to delete event:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return {
        events,
        markedDates,
        loading,
        error,
        createEvent,
        deleteEvent
    };
}

export default useCalendar;
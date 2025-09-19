import { OEvent } from './OEvent';

/**
 * Represents a function that can observe value changes.
 * @template T The type of value being observed
 * @callback Observer
 * @param {T} value - The new value being emitted
 * @returns {void}
 */
export type Observer<T> = (value: T) => void;

/**
 * A type-safe implementation of the Observer pattern that maintains the current value
 * and provides immediate value emission to new subscribers. This implementation is
 * designed to be easily migrated to one.models in the future.
 * 
 * @template T The type of value being observed
 * @example
 * ```typescript
 * const counter = new Observable<number>(0);
 * const unsubscribe = counter.subscribe(value => console.log(value));
 * counter.next(1); // logs: 1
 * unsubscribe(); // cleanup
 * ```
 */
export interface IObservable<T> {
    subscribe(observer: IObserver<T>): void;
    unsubscribe(observer: IObserver<T>): void;
    notify(data: T): void;
}

export interface IObserver<T> {
    update(data: T): void;
}

export class Observable<T> implements IObservable<T> {
    private observers: IObserver<T>[] = [];
    
    subscribe(observer: IObserver<T>): void {
        this.observers.push(observer);
    }
    
    unsubscribe(observer: IObserver<T>): void {
        const index = this.observers.indexOf(observer);
        if (index > -1) {
            this.observers.splice(index, 1);
        }
    }
    
    notify(data: T): void {
        this.observers.forEach(observer => observer.update(data));
    }
}

export function createObservable<T>(): IObservable<T> {
    return new Observable<T>();
}

// Export for Expo Router compatibility
const ObserverExport = {
    default: {
        Observable,
        createObservable
    }
};

export default ObserverExport;
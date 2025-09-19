import * as dateFns from 'date-fns';

/**
 * Format a date into a string with the specified separator
 * @param date The date to format
 * @param separator The separator to use between date parts (default: '.')
 * @returns The formatted date string
 */
export function formatDate(date: Date, separator: string = '.'): string {
    return dateFns.format(date, `dd${separator}MM${separator}yyyy`);
}

/**
 * Sort function for dates
 * @param datePropertyName The name of the date property to sort by
 * @param direction The sort direction ('asc' or 'desc')
 * @returns A sort function that can be used with Array.sort()
 */
export function getSorterByDate<T>(
    datePropertyName: keyof T,
    direction: 'asc' | 'desc' = 'desc'
): (one: T, two: T) => number {
    return (one: T, two: T) => {
        const oneDate = one[datePropertyName] as unknown as Date;
        const twoDate = two[datePropertyName] as unknown as Date;

        if (!oneDate && !twoDate) {
            return 0;
        }
        if (!oneDate) {
            return direction === 'asc' ? 1 : -1;
        }
        if (!twoDate) {
            return direction === 'asc' ? -1 : 1;
        }

        return direction === 'asc'
            ? dateFns.compareAsc(oneDate, twoDate)
            : dateFns.compareDesc(oneDate, twoDate);
    };
} 
// Platform injection for promise utilities
let PR: any;

export function setPlatformForPr(exports: any): void {
    PR = exports;
} 
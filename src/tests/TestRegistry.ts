import type { ITestSuite } from './types';

const testSuites: ITestSuite[] = [];

export const registerTestSuite = (suite: ITestSuite) => {
    testSuites.push(suite);
};

export const getTestSuites = () => {
    return testSuites;
};

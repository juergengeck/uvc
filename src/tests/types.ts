export interface ITestCase {
    name: string;
    description: string;
    category: string;
    run: () => Promise<void>;
}

export interface ITestSuite {
    getTestCases: () => ITestCase[];
}

module.exports = {
    testEnvironment: 'node',
    testTimeout: 60000, // Tăng timeout lên 60 giây
    verbose: true,
    setupFilesAfterEnv: ['./jest.setup.js']
}; 
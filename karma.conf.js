// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
    config.set({
        basePath: '',

        exclude: [
            'src/**/*.d.ts',
            'src/mls-ts/test/*',
            'src/mls-ts/node_modules/*'
        ],

        files: [
            'src/index.ts',
            { pattern: 'src/*.ts' },
            { pattern: 'test/*.ts' },
            { pattern: 'src/mls-ts/src/*.ts' },
            { pattern: 'src/mls-ts/src/hpke/*.ts' }
        ],


        frameworks: ['jasmine', 'karma-typescript'],

        preprocessors: {
            './index.ts': ['karma-typescript'],
            './src/**/*.ts': ['karma-typescript'],
            './test/*.spec.ts': ['karma-typescript']
        },

        karmaTypescriptConfig: {
            tsconfig: "./tsconfig.json",
            bundlerOptions: {
                sourceMap: true
            }
        },

        plugins: [
            require('karma-typescript'),
            require('karma-jasmine'),
            require('karma-chrome-launcher'),
            require('karma-jasmine-html-reporter'),
            require('karma-sourcemap-loader')
        ],
        client: {
            jasmine: {
                // you can add configuration options for Jasmine here
                // the possible options are listed at https://jasmine.github.io/api/edge/Configuration.html
                // for example, you can disable the random execution with `random: false`
                // or set a specific seed with `seed: 4321`
                random: false,
            },
            clearContext: false, // leave Jasmine Spec Runner output visible in browser
        },
        jasmineHtmlReporter: {
            suppressAll: true // removes the duplicated traces
        },
        coverageReporter: {
            dir: require('path').join(__dirname, './coverage/ngv'),
            subdir: '.',
            reporters: [
                { type: 'html' },
                { type: 'text-summary' }
            ]
        },
        reporters: ['progress', 'kjhtml'],
        port: 8100,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: false,
        browsers: ['Chrome'],
        singleRun: true,
        restartOnFileChange: false,
        rollup: true
    });
};

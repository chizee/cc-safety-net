export declare const logsCommand: {
    name: "logs";
    description: string;
    usage: string;
    options: ({
        flags: string;
        argument: string;
        description: string;
        default: string;
    } | {
        flags: string;
        argument: string;
        description: string;
        default?: undefined;
    } | {
        flags: string;
        description: string;
        argument?: undefined;
        default?: undefined;
    })[];
    examples: string[];
};

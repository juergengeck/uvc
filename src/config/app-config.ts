// Use the actual identity format from one.leute
export type InitialIopPeerInfo = {
    identityFile: string;
    identity: {
        type: string;
        personEmail: string;
        instanceName: string;
        personKeyPublic: string;
        personSignKeyPublic: string;
        instanceKeyPublic: string;
        instanceSignKeyPublic: string;
        url: string;
    };
    initialName?: string;
    group?: string;
};

type AppConfig = {
    app: string;
    commServerUrl: string;
    initialIopPeers: InitialIopPeerInfo[];
    enableLogging: boolean;
    logTypes: ('error' | 'alert' | 'log' | 'debug')[];
};

/**
 * Get the default configuration for the lama app
 * This includes the glue and leute replicants as IOP peers using the actual identity data from one.leute
 */
export function getDefaultConfig(): AppConfig {
    return {
        app: "lama",
        commServerUrl: "wss://comm10.dev.refinio.one",
        initialIopPeers: [
            {
                identityFile: "leute.id.json",
                identity: {
                    type: "public",
                    personEmail: "3_tKJgdjnSis1DAk_DRQaFkING9L6hv8pCWxZQKk_gNxZObDO0GvDzyE9PeCn3Zt",
                    instanceName: "cxAjMqpB-5w-AeeJXbmMVQCledLm4D_YzzngOHribbOnQqu6ZqXd0wfQspmfc7iZ",
                    personKeyPublic: "196783f96c9ab6e5514dc53538f4a298d8a7044b455645f2e17a18c92ca7350a",
                    personSignKeyPublic: "a00b362cb59d1a5ff87bf297d50b77b99e0385848ad380797a7e837042e86c34",
                    instanceKeyPublic: "d5fa8fcb554c57145104405d8d8631d5ce04cbe3d6fb393542140c994e70cb29",
                    instanceSignKeyPublic: "776bd21b76b541ac91bcd972f692dd05b4a49969c2c7dddbb00da732d08c667e",
                    url: "wss://comm10.dev.refinio.one"
                },
                initialName: "Refinio LEUTE.ONE Replicant",
                group: "leuteReplicant"
            },
            {
                identityFile: "glue.id.json", 
                identity: {
                    type: "public",
                    personEmail: "VKJBH3Q4a6lm-tKfwYtTe65Bnb0vY1ygltBBD-CBTFxxQPF2tPA5OffiKD-sS8Ij",
                    instanceName: "rGwZK4O-WayKSphCx12yjr8OzX8iEYIVK_-G9L5hmRNlpWwCSW3bB1vv3ecrzmeN",
                    personKeyPublic: "39e848317188e4e14b6a5c474506d4ad8dfbce5b40ed6a9990cff43af92f3439",
                    personSignKeyPublic: "9cb08179555679eb8129bffddcb464df1dc3803b2fbd64a5b03e5b065fbe1aa6",
                    instanceKeyPublic: "6f90865cc45b3e162df687e5c10136f934c6bddd32036db8fed5e0f192c71151",
                    instanceSignKeyPublic: "2419c68fb5afeafccaa4c81742aee4ea6936889410820388fca4d8df5202fab8",
                    url: "wss://comm10.dev.refinio.one"
                },
                initialName: "Refinio GLUE.ONE Replicant",
                group: "glueReplicant"
            }
        ],
        enableLogging: true,
        logTypes: ["error", "alert", "log", "debug"]
    };
} 
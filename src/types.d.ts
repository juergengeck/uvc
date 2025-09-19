/// <reference types="react" />

declare module '@/utils/platform' {
    export function isIOS(): boolean;
    export function isMobile(): boolean;
}

declare module 'react-i18next' {
    export function useTranslation(ns?: string): {
        t: (key: string, options?: Record<string, any>) => string;
    };
    export const initReactI18next: {
        type: any;
        init: (config: any) => void;
    };
}

declare module 'react-native-svg' {
    export interface SvgProps {
        width?: number | string;
        height?: number | string;
        fill?: string;
        stroke?: string;
    }
    
    export interface SvgXmlProps extends SvgProps {
        xml: string;
    }
    
    export const SvgXml: React.FC<SvgXmlProps>;
}

declare module '*.svg' {
    import type { SvgProps } from 'react-native-svg';
    const content: React.FC<SvgProps>;
    export default content;
}

declare module '*.md' {
    const content: string;
    export default content;
}

declare module '@/utils/Utils.js' {
    export function isStandalone(): boolean;
}

declare module '@/components/notification/SnackbarNotification.js' {
    export const NOTIFICATION: {
        Error: string;
        Success: string;
        Warning: string;
        Info: string;
    };
    export function useNotificationContext(): {
        setNotificationMessage: (message: string) => void;
        setNotificationType: (type: string) => void;
    };
}

declare module '@/components/IconAvatar/IconAvatar.js' {
    import type {ReactElement} from 'react';
    export function IconAvatar(props: { name: string }): ReactElement;
}

declare module '@/hooks/navigation.js' {
    export function useNavigateBack(): () => void;
}

declare module '@/model/StudyShareModel.js' {
    export default interface StudyShareModel {
        giveStudyConsent(options: {
            file: File;
            text: string;
        }): Promise<void>;
        revokeStudyConsent(options: {
            file: File;
            text: string;
        }): Promise<void>;
        getStudyIdentity(): Promise<any>;
        startSharing(): Promise<void>;
        shutdown(): Promise<void>;
        init(): Promise<void>;
    }
}

declare module '@/digionko/components/addToHomescreen/AddToHomeScreen.js' {
    import type {ReactElement} from 'react';
    export default function AddToHomeScreen(): ReactElement;
}

declare module '*.json' {
    const value: any;
    export default value;
}

declare module '@refinio/one.core' {
    export interface Model {
        settings: {
            getValue(key: string): Promise<string | boolean | undefined>;
            setValue(key: string, value: string): Promise<void>;
        };
    }
    export function useModel(): {
        model: Model;
    };
}

declare module '@refinio/one.models' {
    export function useModelState(model: any, type: string): {
        isReady: boolean;
        error: string | null;
    };
}

declare module 'llama.rn' {
  export interface ContextParams {
    model: string;
    n_threads?: number;
    n_ctx?: number;
    n_batch?: number;
    n_gpu_layers?: number;
  }

  export interface CompletionParams {
    prompt: string;
    n_predict?: number;
    temperature?: number;
    top_p?: number;
    stop?: string[];
    verbose?: boolean;
  }

  export interface TokenData {
    token: string;
    logprob?: number;
  }

  export interface ModelInfo {
    architecture: string;
    quantization: string;
    parameters: number;
    contextLength: number;
  }
  
  export interface CompletionResult {
    content: string;
    tokens_predicted?: number;
    tokens_evaluated?: number;
    stop_reason?: number;
  }

  export class LlamaContext {
    id: number;
    gpu: boolean;
    reasonNoGPU?: string;
    model?: {
      architecture?: string;
    };
    
    completion(params: CompletionParams, onToken?: (token: TokenData) => void): Promise<CompletionResult>;
    
    // Optional streaming API that might be available in future versions
    completionStream?: (params: CompletionParams, onProgress?: (partialResponse: string) => void) => Promise<CompletionResult>;
    
    release(): Promise<void>;
  }

  export function initLlama(config: ContextParams): Promise<LlamaContext>;
  export function loadLlamaModelInfo(modelPath: string): Promise<ModelInfo>;
} 
// Routes configuration file - exports route paths only

type Routes = {
  auth: {
    login: string;
  };
  tabs: {
    index: string;
    contacts: string;
    journal: string;
    profile: string;
    settings: string;
  };
  onboarding: string;
  questionnaire: string;
  screens: {
    welcome: string;
    settings: string;
    dataManagement: string;
    consent: string;
    health: string;
    tasks: string;
    editProfile: string;
    languageSelection: string;
    about: string;
    chat: string;
    inquiriesAndStudies: string;
    udpDiagnostic: string;
    quicTest: string;
    addContact: string;
    editContact: string;
    contactDetails: string;
    deviceList: string;
    deviceDetail: string;
    networkDiscovery: string;
    networkConnection: string;
    networkAdvanced: string;
    networkDiagnostics: string;
  };
};

export const routes: Routes = {
  auth: {
    login: '/(auth)/login',
  },
  tabs: {
    index: '/(tabs)/home',
    contacts: '/(tabs)/contacts',
    journal: '/(tabs)/journal', 
    profile: '/(tabs)/profile',
    settings: '/(screens)/settings',
  },
  onboarding: '/(onboarding)',
  questionnaire: '/questionnaire',
  screens: {
    welcome: '/(screens)/welcome',
    settings: '/(screens)/settings',
    dataManagement: '/(screens)/data-management',
    consent: '/(screens)/consent',
    health: '/(screens)/health',
    tasks: '/(screens)/tasks',
    editProfile: '/(screens)/edit-profile',
    languageSelection: '/(screens)/language-selection',
    about: '/(screens)/about',
    chat: '/(screens)/chat',
    inquiriesAndStudies: '/(screens)/inquiries-and-studies',
    udpDiagnostic: '/(screens)/udp-diagnostic',
    quicTest: '/(screens)/quic-test',
    addContact: '/(screens)/contacts/add-contact',
    editContact: '/(screens)/contacts/edit',
    contactDetails: '/(screens)/contacts/someone',
    deviceList: '/(screens)/device-list',
    deviceDetail: '/(screens)/device-detail',
    networkDiscovery: '/(screens)/network/discovery',
    networkConnection: '/(screens)/network/connection',
    networkAdvanced: '/(screens)/network/advanced',
    networkDiagnostics: '/(screens)/network/diagnostics',
  },
};

// Note: Root component removed - app/index.tsx handles all routing logic
// to avoid dual redirect conflicts that cause React Navigation format errors 
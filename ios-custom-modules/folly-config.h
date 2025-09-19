// Folly Configuration Header
// This file ensures Folly coroutines are disabled across all modules
// Include this header in any module that uses Folly

#ifndef FOLLY_CONFIG_H
#define FOLLY_CONFIG_H

// Disable Folly coroutines globally
#ifndef FOLLY_HAS_COROUTINES
#define FOLLY_HAS_COROUTINES 0
#endif

// Additional Folly configurations for React Native compatibility
#ifndef FOLLY_NO_CONFIG
#define FOLLY_NO_CONFIG 1
#endif

#ifndef FOLLY_MOBILE
#define FOLLY_MOBILE 1
#endif

#ifndef FOLLY_USE_LIBCPP
#define FOLLY_USE_LIBCPP 1
#endif

#endif // FOLLY_CONFIG_H
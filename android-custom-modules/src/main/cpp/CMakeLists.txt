cmake_minimum_required(VERSION 3.13)

# Set the project name
project(custommodules)

# Find the React Native package
find_package(ReactAndroid REQUIRED CONFIG)

# For now, this file serves as a placeholder for future custom C++ modules
# The UDP-related modules have been removed

# Include directories for future modules
set(INCLUDE_DIRS
    "${NODE_MODULES_DIR}/react-native/ReactCommon"
    "${NODE_MODULES_DIR}/react-native/ReactCommon/callinvoker"
    "${NODE_MODULES_DIR}/react-native/ReactAndroid/src/main/jni/react/jni"
)

# Set C++ standard for future modules
set(CXX_FLAGS
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)

# Example of adding a future library:
# add_library(example_jni SHARED example.cpp)
# target_include_directories(example_jni PRIVATE ${INCLUDE_DIRS})
# target_link_libraries(example_jni
#    ReactAndroid::jsi
#    ReactAndroid::reactnativejni
#    ReactAndroid::react_nativemodule_core
#    android
#    log
# )
# set_target_properties(example_jni PROPERTIES ${CXX_FLAGS}) 
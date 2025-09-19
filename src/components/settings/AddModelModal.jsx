import React from 'react';
import { View, Modal, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';

/**
 * Modal for adding new AI models
 */
const AddModelModal = ({ visible, onClose, onAdd }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Add Model</Text>
          <Text>This component is a stub. Full implementation needed.</Text>
          <Button onPress={onClose} mode="contained" style={styles.button}>
            Close
          </Button>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  button: {
    marginTop: 20,
  },
});

export default AddModelModal; 
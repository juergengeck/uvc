/**
 * LLM Model Selector Component
 * 
 * Allows selecting between different LLM models (local and cloud).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Menu } from 'react-native-paper';
import type { LLMUIModel } from '@src/types/llm';

interface LLMSelectorProps {
  /**
   * Currently selected model
   */
  selectedModel: LLMUIModel | null;

  /**
   * Available models to select from
   */
  models: LLMUIModel[];

  /**
   * Callback when a model is selected
   */
  onSelect: (model: LLMUIModel) => void;

  /**
   * Loading state
   */
  loading?: boolean;
}

export function LLMSelector({
  selectedModel,
  models,
  onSelect,
  loading = false
}: LLMSelectorProps) {
  const [visible, setVisible] = React.useState(false);

  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);

  const handleSelect = (model: LLMUIModel) => {
    onSelect(model);
    closeMenu();
  };

  return (
    <View style={styles.container}>
      <Menu
        visible={visible}
        onDismiss={closeMenu}
        anchor={
          <Button
            mode="outlined"
            onPress={openMenu}
            loading={loading}
            disabled={loading}
          >
            {selectedModel?.displayName || 'Select Model'}
          </Button>
        }
      >
        {models.map(model => (
          <Menu.Item
            key={model.id}
            onPress={() => handleSelect(model)}
            title={model.displayName}
            disabled={loading}
          />
        ))}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
  }
}); 
import React from 'react';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

type Props = {
  content: string;
};

const markdownIt = MarkdownIt({
  typographer: true,
});

export default function MarkdownComponent({ content }: Props): ReactElement {
  return (
    <ScrollView style={styles.container}>
      <Markdown markdownit={markdownIt}>
        {content}
      </Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
}); 

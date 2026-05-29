import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize } from '../../constants/theme';

interface DatePickerInputProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  compact?: boolean;
}

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  placeholder = 'Pilih Tanggal',
  style,
  iconSize = 16,
  compact = false,
}) => {
  const [show, setShow] = useState(false);

  const onChangeDate = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // If running on Android, hiding the picker immediately after a selection is standard
    if (Platform.OS === 'android') {
      setShow(false);
    }
    
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate);
    } else if (event.type === 'dismissed' && Platform.OS === 'android') {
      // Do nothing, just close
    }
  };

  const clearDate = () => {
    onChange(null);
  };

  // Format as YYYY-MM-DD
  const formattedDate = value
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : '';

  return (
    <View style={[styles.container, compact ? styles.compactContainer : styles.normalContainer, style]}>
      <TouchableOpacity 
        style={styles.touchable} 
        onPress={() => setShow(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={iconSize} color={Colors.textTertiary} />
        <Text style={[styles.text, !value && styles.placeholderText, compact && styles.compactText]}>
          {value ? formattedDate : placeholder}
        </Text>
      </TouchableOpacity>
      
      {value ? (
        <TouchableOpacity style={styles.clearBtn} onPress={clearDate}>
          <Ionicons name="close-circle" size={iconSize} color={Colors.textTertiary} />
        </TouchableOpacity>
      ) : null}

      {show && (
        <DateTimePicker
          value={value || new Date()}
          mode="date"
          display="default"
          onChange={onChangeDate}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  normalContainer: {
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  compactContainer: {
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 32,
    flex: 1,
  },
  touchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    marginLeft: 6,
    color: Colors.textPrimary,
  },
  compactText: {
    fontSize: 10,
    marginLeft: 4,
  },
  placeholderText: {
    color: Colors.textTertiary,
  },
  clearBtn: {
    padding: 2,
  },
});

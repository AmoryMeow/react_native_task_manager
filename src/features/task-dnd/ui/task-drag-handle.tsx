import { View } from "react-native";

export function TaskDragHandleDots() {
  return (
    <View className="w-[9px] flex-row flex-wrap gap-[3px]">
      {Array.from({ length: 6 }, (_, index) => (
        <View
          className="h-[3px] w-[3px] rounded-full bg-zinc-400"
          key={index}
        />
      ))}
    </View>
  );
}

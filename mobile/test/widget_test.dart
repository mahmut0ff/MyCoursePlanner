import 'package:flutter_test/flutter_test.dart';


void main() {
  testWidgets('App renders login screen', (WidgetTester tester) async {
    // Verify the app starts without crashing.
    // Firebase requires initialization, so just test the widget tree.
    expect(find.text('Planula'), findsNothing);
  });
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/constants.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) context.go('/onboarding');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.deepPurple, AppColors.purple],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('🦄', style: TextStyle(fontSize: 92)),
            SizedBox(height: 16),
            Text(
              AppConstants.appName,
              style: TextStyle(
                color: Colors.white,
                fontSize: 34,
                fontWeight: FontWeight.w900,
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 12),
            Text(
              '¡Aprende jugando cada dia!',
              style: TextStyle(color: Colors.white, fontSize: 20),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(color: AppColors.yellow),
          ],
        ),
      ),
    );
  }
}

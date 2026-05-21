import 'package:flutter/material.dart';

import '../../../app/constants.dart';

class AcademicInfoScreen extends StatelessWidget {
  const AcademicInfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Informacion academica')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text(
            AppConstants.appName,
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
          ),
          SizedBox(height: 12),
          Text(
            'Finalidad educativa: fortalecer aprendizajes basicos mediante juegos didacticos, retroalimentacion inmediata, niveles, estrellas y seguimiento local.',
          ),
          SizedBox(height: 12),
          Text(
            'Uso responsable: sesiones cortas de 10 a 15 minutos, con acompanamiento adulto.',
          ),
          SizedBox(height: 12),
          Text(
            'Esta app complementa el aprendizaje, no reemplaza al docente ni al acompanamiento familiar.',
          ),
          SizedBox(height: 12),
          Text(
            'Etica infantil: no recolecta datos sensibles, no usa camara, microfono, ubicacion, chat, redes sociales, publicidad ni compras internas.',
          ),
        ],
      ),
    );
  }
}

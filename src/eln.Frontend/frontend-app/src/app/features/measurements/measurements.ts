import { Component } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

@Component({
  selector: 'app-measurements',
  imports: [Header, Footer],
  templateUrl: './measurements.html',
  styleUrl: './measurements.scss',
})
export class Measurements {

}

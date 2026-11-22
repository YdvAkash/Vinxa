package com.vinxa.live;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class VinxaLiveApplication {
    public static void main(String[] args) {
        SpringApplication.run(VinxaLiveApplication.class, args);
    }
}

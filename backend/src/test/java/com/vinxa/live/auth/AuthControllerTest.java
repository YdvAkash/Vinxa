package com.vinxa.live.auth;

import com.vinxa.live.auth.dto.AuthResponse;
import com.vinxa.live.auth.dto.LoginRequest;
import com.vinxa.live.auth.dto.RegisterRequest;
import com.vinxa.live.user.User;
import com.vinxa.live.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    private AuthController authController;

    @BeforeEach
    void setUp() {
        authController = new AuthController(userRepository, passwordEncoder, tokenProvider);
    }

    @Test
    void testRegisterSuccess() {
        RegisterRequest req = new RegisterRequest("newuser@example.com", "secret123");
        when(userRepository.existsByEmail("newuser@example.com")).thenReturn(false);
        when(passwordEncoder.encode("secret123")).thenReturn("hashedPass");
        when(tokenProvider.generateToken(any(), eq("newuser@example.com"))).thenReturn("jwt.token.val");

        ResponseEntity<AuthResponse> response = authController.register(req);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("jwt.token.val", response.getBody().token());
        assertEquals("newuser@example.com", response.getBody().email());
        verify(userRepository).save(any(User.class));
    }

    @Test
    void testRegisterDuplicateEmailThrows() {
        RegisterRequest req = new RegisterRequest("existing@example.com", "secret123");
        when(userRepository.existsByEmail("existing@example.com")).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> authController.register(req));
        verify(userRepository, never()).save(any());
    }

    @Test
    void testLoginSuccess() {
        LoginRequest req = new LoginRequest("user@example.com", "secret123");
        User user = new User(UUID.randomUUID(), "user@example.com", "hashedPass", OffsetDateTime.now());
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("secret123", "hashedPass")).thenReturn(true);
        when(tokenProvider.generateToken(user.getId(), user.getEmail())).thenReturn("jwt.token.val");

        ResponseEntity<AuthResponse> response = authController.login(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("jwt.token.val", response.getBody().token());
    }

    @Test
    void testLoginInvalidPasswordThrows() {
        LoginRequest req = new LoginRequest("user@example.com", "wrongpass");
        User user = new User(UUID.randomUUID(), "user@example.com", "hashedPass", OffsetDateTime.now());
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrongpass", "hashedPass")).thenReturn(false);

        assertThrows(BadCredentialsException.class, () -> authController.login(req));
    }
}

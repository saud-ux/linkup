import random

WIDTH = 800
HEIGHT = 400

GRAVITY = 0.5
JUMP_STRENGTH = -12
GAME_SPEED = 6


dino_x = 100
dino_y = 300
dino_w = 40
dino_h = 50
dino_velocity = 0
on_ground = True


cactus_x = WIDTH
cactus_y = 310
cactus_w = 20
cactus_h = 40

score = 0
game_over = False

def on_key_down(key):
    global dino_velocity, on_ground
    if key == keys.SPACE and on_ground:
        dino_velocity = JUMP_STRENGTH
        on_ground = False

def update():
    global dino_y, dino_velocity, on_ground, cactus_x, score, game_over
    if game_over:
        return
    dino_velocity += GRAVITY
    dino_y += dino_velocity
    if dino_y >= 300:
        dino_y = 300
        dino_velocity = 0
        on_ground = True

    cactus_x -= GAME_SPEED

    if cactus_x + cactus_w < 0:
        cactus_x = WIDTH + random.randint(0, 300)
        score += 1

    if (dino_x < cactus_x + cactus_w and dino_x + dino_w > cactus_x and
        dino_y < cactus_y + cactus_h and dino_y + dino_h > cactus_y):
        game_over = True

def draw():
    screen.clear()
    screen.draw.filled_rect(Rect((dino_x, dino_y), (dino_w, dino_h)), "gray")
    screen.draw.filled_rect(Rect((cactus_x, cactus_y), (cactus_w, cactus_h)), "green")
    screen.draw.text(str(score), (10, 10), color="white")